/**
 * MinerU v4 官方 API 客户端 (Final)
 *
 * 基于 MinerU 官方 Precision Extract API (v4)
 * 文档: https://mineru.net/apiManage/docs
 *
 * 流程:
 *   方案A (批量自动任务):
 *     1. POST /api/v4/file-urls/batch → 签名上传URL → PUT 文件到 OSS
 *     2. 系统自动创建提取任务
 *     3. 轮询 GET /api/v4/extract/task/{task_id} 获取结果
 *     4. 下载 ZIP → 解压 → 读取 MD + JSON
 *
 *   方案B (公共 URL) - 生产环境:
 *     1. 文件保存到 public/ 目录
 *     2. POST /api/v4/extract/task {url, model:'vlm', is_ocr:true} 提交
 *     3. 轮询 GET /api/v4/extract/task/{task_id}
 *     4. 下载 ZIP → 解压 → 读取 MD + JSON
 *
 * 强制启用 VLM 模型 + OCR，确保最高识别精度。
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import axios from 'axios';
import { HybridQuestionIdentifier, type ParsedQuestion } from './question-identifier';

const MINERU_BASE_URL = 'https://mineru.net';
const MINERU_API_TOKEN = process.env.MINERU_API_TOKEN || '';

if (!MINERU_API_TOKEN) {
  console.warn('[MinerU v4]  MINERU_API_TOKEN 环境变量未设置');
}

const AUTH_HEADER = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${MINERU_API_TOKEN}`,
};

const questionIdentifier = new HybridQuestionIdentifier();

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';

// ============================================================
// 临时文件托管（为本地开发提供可公开访问的URL）
// ============================================================

/**
 * 上传文件到临时托管服务，获取公开URL
 * 用于本地开发环境（localhost 对外不可达时）
 */
async function uploadToTmpHost(filePath: string): Promise<string | null> {
  const fileName = path.basename(filePath);

  // 尝试 tmpfiles.org（最大 100MB）
  try {
    console.log('  [MinerU v4] 尝试上传到临时托管...');
    const FormDataLib = require('form-data');
    const form = new FormDataLib();
    form.append('file', fs.createReadStream(filePath), fileName);

    const resp = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
      headers: { ...form.getHeaders() },
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024,
    });

    if (resp.data?.data?.url) {
      const url = resp.data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      console.log(`  [MinerU v4] 临时托管URL: ${url}`);
      return url;
    }
  } catch (e) {
    console.log(`  [MinerU v4] tmpfiles.org 上传失败: ${e instanceof Error ? e.message : '未知'}`);
  }

  // 尝试 file.io
  try {
    const FormDataLib = require('form-data');
    const form = new FormDataLib();
    form.append('file', fs.createReadStream(filePath), fileName);

    const resp = await axios.post('https://file.io', form, {
      headers: { ...form.getHeaders() },
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024,
    });

    if (resp.data?.link) {
      console.log(`  [MinerU v4] file.io URL: ${resp.data.link}`);
      return resp.data.link;
    }
  } catch (e) {
    console.log(`  [MinerU v4] file.io 上传失败: ${e instanceof Error ? e.message : '未知'}`);
  }

  console.log('  [MinerU v4] 临时托管服务不可用，回退到本地public/目录');
  return null;
}

// ============================================================
// 类型定义
// ============================================================

export interface MinerUOptions {
  model_version?: 'pipeline' | 'vlm' | 'MinerU-HTML';
  is_ocr?: boolean;
  enable_formula?: boolean;
  enable_table?: boolean;
  language?: string;
  data_id?: string;
  page_ranges?: string;
  extra_formats?: string[];
}

export interface ContentBlock {
  type: 'text' | 'list' | 'image' | 'text_image' | 'table' | 'formula';
  text: string;
  textLevel?: number;
  bbox: [number, number, number, number];
  pageIdx: number;
  subType?: string;
  listItems?: string[];
  imgPath?: string;
  imageCaption?: string[];
  imageFootnote?: string[];
}

export interface ContentFormula {
  latex: string;
  bbox: [number, number, number, number];
  page: number;
}

export interface StructuredOcrData {
  blocks: ContentBlock[];
  formulas: ContentFormula[];
}

export interface MinerUResult {
  success: boolean;
  markdownContent?: string;
  questions?: ParsedQuestion[];
  structuredData?: StructuredOcrData;
  error?: string;
  elapsed?: number;
  pages?: number;
  savedDir?: string;
}

export { ParsedQuestion };

// ============================================================
// 内部类型
// ============================================================

interface TaskCreateResponse {
  code: number;
  msg: string;
  data: { task_id: string };
}

interface TaskStatusResponse {
  code: number;
  msg: string;
  data: {
    task_id: string;
    state: 'done' | 'pending' | 'running' | 'failed' | 'converting';
    full_zip_url?: string;
    err_msg?: string;
    extract_progress?: {
      extracted_pages: number;
      total_pages: number;
      start_time: string;
    };
  };
}

// ============================================================
// 方案B: 单文件 API（需要文件有公开可访问的 URL）
// ============================================================

async function createTaskViaUrl(
  fileUrl: string,
  options: MinerUOptions,
): Promise<string | null> {
  try {
    const payload: Record<string, unknown> = {
      url: fileUrl,
      model_version: options.model_version || 'vlm',
      is_ocr: options.is_ocr ?? true,
      enable_formula: options.enable_formula ?? true,
      enable_table: options.enable_table ?? true,
      language: options.language || 'ch',
    };
    if (options.data_id) payload.data_id = options.data_id;
    if (options.page_ranges) payload.page_ranges = options.page_ranges;
    if (options.extra_formats) payload.extra_formats = options.extra_formats;

    const resp = await axios.post<TaskCreateResponse>(
      `${MINERU_BASE_URL}/api/v4/extract/task`,
      payload,
      { headers: AUTH_HEADER, timeout: 30000 },
    );

    if (resp.data.code === 0) {
      return resp.data.data.task_id;
    }
    console.error('  [MinerU v4] 创建任务失败:', resp.data);
    return null;
  } catch (error) {
    console.error('  [MinerU v4] 创建任务异常:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}

// ============================================================
// 方案A: 批量上传 API
// ============================================================

async function requestUploadUrl(
  fileName: string,
  options: MinerUOptions,
): Promise<{ batch_id: string; signedUrl: string; fileUuid: string } | null> {
  try {
    const payload = {
      files: [{ name: fileName, data_id: options.data_id || `task-${Date.now()}` }],
      model_version: options.model_version || 'vlm',
    };

    const resp = await axios.post(
      `${MINERU_BASE_URL}/api/v4/file-urls/batch`,
      payload,
      { headers: AUTH_HEADER, timeout: 30000 },
    );

    if (resp.data?.code !== 0) {
      console.error('  [MinerU v4] 获取上传URL失败:', resp.data);
      return null;
    }

    const batchId: string = resp.data.data.batch_id;
    const signedUrl: string = resp.data.data.file_urls?.[0];
    if (!signedUrl) return null;

    // 从 OSS URL 提取文件 UUID (batch_id 后的 UUID)
    const urlParts = signedUrl.split('/');
    const fileUuid = urlParts[urlParts.length - 1].split('?')[0].replace('.pdf', '');

    console.log(`  [MinerU v4] batch_id: ${batchId}`);

    return { batch_id: batchId, signedUrl, fileUuid };
  } catch (error) {
    console.error('  [MinerU v4] 请求上传URL异常:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}

async function uploadFile(
  filePath: string,
  signedUrl: string,
): Promise<boolean> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const resp = await fetch(signedUrl, {
      method: 'PUT',
      body: fileBuffer,
      headers: {},
    });

    if (resp.ok) {
      console.log('  [MinerU v4] 文件上传成功');
      return true;
    }
    console.error('  [MinerU v4] 文件上传失败:', resp.status);
    return false;
  } catch (error) {
    console.error('  [MinerU v4] 文件上传异常:', error instanceof Error ? error.message : '未知错误');
    return false;
  }
}

// ============================================================
// 轮询任务
// ============================================================

async function pollTask(
  taskId: string,
  timeoutMs: number = 600000,
): Promise<TaskStatusResponse['data'] | null> {
  const pollInterval = 3000;
  const startTime = Date.now();

  console.log(`  [MinerU v4] 轮询任务: ${taskId}`);

  while (Date.now() - startTime < timeoutMs) {
    try {
      const resp = await axios.get<TaskStatusResponse>(
        `${MINERU_BASE_URL}/api/v4/extract/task/${taskId}`,
        { headers: AUTH_HEADER, timeout: 15000 },
      );

      if (resp.data?.code !== 0) {
        if (resp.data?.code === -60012) {
          console.log('  [MinerU v4] 任务尚未创建，继续等待...');
          await new Promise(r => setTimeout(r, pollInterval));
          continue;
        }
        console.error('  [MinerU v4] 查询失败:', resp.data);
        return null;
      }

      const td = resp.data.data;
      switch (td.state) {
        case 'done':
          console.log('  [MinerU v4] 任务完成');
          return td;
        case 'failed':
          console.error('  [MinerU v4] 任务失败:', td.err_msg || '未知');
          return null;
        case 'running':
          if (td.extract_progress) {
            console.log(`  [MinerU v4] 进度: ${td.extract_progress.extracted_pages}/${td.extract_progress.total_pages} 页`);
          }
          break;
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log('  [MinerU v4] 任务未找到，继续等待...');
      } else {
        console.error('  [MinerU v4] 轮询异常:', error instanceof Error ? error.message : '未知错误');
      }
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  console.error(`  [MinerU v4] 任务轮询超时 (${timeoutMs / 1000}s)`);
  return null;
}

// ============================================================
// 结果下载与解析
// ============================================================

async function downloadAndExtract(
  zipUrl: string,
  outputDir: string,
  fileName: string,
): Promise<string | null> {
  try {
    console.log('  [MinerU v4] 下载结果ZIP...');
    const resp = await axios.get(zipUrl, {
      responseType: 'arraybuffer',
      timeout: 120000,
    });

    const zipPath = path.join(outputDir, `${fileName}.zip`);
    const extractDir = path.join(outputDir, fileName);
    fs.writeFileSync(zipPath, Buffer.from(resp.data));
    if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });

    console.log('  [MinerU v4] 解压...');
    try {
      if (process.platform === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'ignore' });
      } else {
        execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'ignore' });
      }
    } catch {
      // JSZip fallback
      const zipData = fs.readFileSync(zipPath);
      const JSZip = require('jszip');
      const zip = await JSZip.loadAsync(zipData);
      for (const [name, entry] of Object.entries(zip.files)) {
        const ze = entry as { dir: boolean; async: (t: string) => Promise<Buffer> };
        if (ze.dir) continue;
        const content = await ze.async('nodebuffer');
        const fp = path.join(extractDir, name);
        const d = path.dirname(fp);
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(fp, content);
      }
    }

    fs.unlinkSync(zipPath);
    console.log('  [MinerU v4] 解压完成');
    return extractDir;
  } catch (error) {
    console.error('  [MinerU v4] 下载解压失败:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}

/**
 * 递归搜索目录，返回第一个匹配文件的完整路径
 * MinerU v4 输出目录结构可能为嵌套（如 subdir/md/xxx.md）或扁平，此函数兼容两种结构
 */
function findFileRecursive(dir: string, predicate: (name: string, fullPath: string) => boolean): string | null {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    // 优先在顶层查找（扁平结构快速路径）
    for (const entry of entries) {
      if (entry.isFile() && predicate(entry.name, path.join(dir, entry.name))) {
        return path.join(dir, entry.name);
      }
    }
    // 递归进入子目录（递归结构慢速路径）
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = findFileRecursive(path.join(dir, entry.name), predicate);
        if (found) return found;
      }
    }
  } catch {
    // 忽略权限错误等
  }
  return null;
}

function readMarkdown(extractDir: string): string {
  try {
    const mdPath = findFileRecursive(extractDir, (name) => name.endsWith('.md'));
    if (mdPath) {
      const content = fs.readFileSync(mdPath, 'utf-8');
      if (content) return content;
    }
    // 回退: 尝试 .txt
    const txtPath = findFileRecursive(extractDir, (name) => name.endsWith('.txt'));
    if (txtPath) return fs.readFileSync(txtPath, 'utf-8');
    return '';
  } catch {
    return '';
  }
}

function readContentListJson(extractDir: string): ContentBlock[] | null {
  try {
    const jsonPath = findFileRecursive(extractDir, (name) => name.endsWith('_content_list.json'));
    if (!jsonPath) return null;

    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    return parsed
      .filter((item: any) => item.type !== 'natural_image')
      .map((item: any) => ({
      type: item.type || 'text',
      text: item.text || '',
      textLevel: item.text_level,
      bbox: item.bbox || [0, 0, 0, 0],
      pageIdx: item.page_idx ?? 0,
      subType: item.sub_type,
      listItems: item.list_items,
      imgPath: item.img_path,
      imageCaption: item.image_caption,
      imageFootnote: item.image_footnote,
    }));
  } catch {
    return null;
  }
}

// 支持 MinerU 输出的两种 LaTeX 格式: $$...$$ 和 $...$
const LATEX_DISPLAY_DOLLAR = /\$\$([^]*?)\$\$/g;
const LATEX_INLINE_DOLLAR = /\$([^$]+?)\$/g;

function extractFormulasFromBlocks(blocks: ContentBlock[]): ContentFormula[] {
  const formulas: ContentFormula[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    if (block.type !== 'text' && block.type !== 'list' && block.type !== 'text_image') continue;
    const text = block.type === 'list' ? (block.listItems || []).join('\n') : block.text;

    for (const re of [LATEX_DISPLAY_DOLLAR, LATEX_INLINE_DOLLAR]) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const latex = match[1].trim();
        const key = latex.replace(/\s+/g, '');
        if (!seen.has(key) && latex.length > 1) {
          seen.add(key);
          formulas.push({
            latex,
            bbox: [...block.bbox] as [number, number, number, number],
            page: block.pageIdx,
          });
        }
      }
    }
  }
  return formulas;
}

function readStructuredData(extractDir: string): StructuredOcrData | null {
  const blocks = readContentListJson(extractDir);
  if (!blocks) return null;
  const formulas = extractFormulasFromBlocks(blocks);
  return { blocks, formulas };
}

function saveAllOutputFiles(extractDir: string, outputDir: string, baseName: string): void {
  try {
    const copyRecursive = (srcDir: string, destDir: string, prefix: string) => {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        const src = path.join(srcDir, entry.name);
        if (entry.isDirectory()) {
          // 子目录（如 images/）保持原名递归复制
          const dest = path.join(destDir, entry.name);
          if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
          copyRecursive(src, dest, prefix);
        } else {
          // 文件添加 baseName 前缀避免覆盖
          const dest = path.join(destDir, `${prefix}-${entry.name}`);
          fs.copyFileSync(src, dest);
        }
      }
    };
    copyRecursive(extractDir, outputDir, baseName);
    console.log(`  [MinerU v4] 输出文件已保存: ${outputDir}/`);
  } catch (error) {
    console.error('  [MinerU v4] 保存输出文件失败:', error);
  }
}

function extractQuestions(md: string, structured?: StructuredOcrData | null): ParsedQuestion[] {
  const blocks = questionIdentifier.splitContent(md);
  const questions = questionIdentifier.convertToQuestions(blocks);

  // 从原始 MD 提取章节标题和标注文本，注入到每个题目的 title 中
  enrichQuestionsWithSectionTitles(md, questions);

  if (structured && questions.length > 0) {
    bridgeStructuredData(questions, structured);
  }

  console.log(`  [MinerU v4] 识别到 ${questions.length} 道题`);
  return questions;
}

/**
 * 从原始 MD 中提取章节标题（如 "# 一、等差数列"）和标注文本（如 "【标注】【拓展思维】等差数列截断求和"），
 * 根据题目在 MD 中的位置匹配到对应的 ParsedQuestion.title
 */
function enrichQuestionsWithSectionTitles(md: string, questions: ParsedQuestion[]): void {
  const lines = md.split('\n');

  // 扫描所有章节标题位置和名称
  interface SectionInfo {
    lineIndex: number;
    name: string;
    annotationHints: string[];
  }
  const sections: SectionInfo[] = [];
  const sectionHeaderRe = /^#{1,3}\s*[(（]?[一二三四五六七八九十]+[)）]?[、，]?\s*(.+)$/;
  const annotationRe = /【标注】(?:【[^】]+】)*(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const headerMatch = trimmed.match(sectionHeaderRe);
    if (headerMatch) {
      sections.push({
        lineIndex: i,
        name: headerMatch[1].trim(),
        annotationHints: [],
      });
    }
  }

  if (sections.length === 0) return;

  // 为每个段落收集标注文本
  for (let si = 0; si < sections.length; si++) {
    const currentSection = sections[si];
    const nextSectionLine = sections[si + 1]?.lineIndex ?? lines.length;
    for (let li = currentSection.lineIndex + 1; li < nextSectionLine; li++) {
      const annotationMatch = lines[li].trim().match(annotationRe);
      if (annotationMatch) {
        currentSection.annotationHints.push(annotationMatch[1].trim());
      }
    }
  }

  // 为每道题匹配所属章节
  for (const q of questions) {
    // 用题干前 80 字符在原 MD 中定位行号
    const searchText = q.content.replace(/\s+/g, '').substring(0, 80);
    let questionLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].replace(/\s+/g, '').includes(searchText)) {
        questionLine = i;
        break;
      }
    }

    if (questionLine < 0) continue;

    // 找到该行所属的章节
    let matchedSection: SectionInfo | undefined;
    for (let si = sections.length - 1; si >= 0; si--) {
      if (questionLine >= sections[si].lineIndex) {
        matchedSection = sections[si];
        break;
      }
    }

    if (!matchedSection) continue;

    // 寻找该题附近（该题到下一题之间）的标注文本
    const qIdx = questions.indexOf(q);
    const nextQLine = qIdx < questions.length - 1
      ? (() => {
          const nextText = questions[qIdx + 1].content.replace(/\s+/g, '').substring(0, 80);
          for (let i = questionLine + 1; i < lines.length; i++) {
            if (lines[i].replace(/\s+/g, '').includes(nextText)) return i;
          }
          return lines.length;
        })()
      : lines.length;

    const nearbyAnnotations: string[] = [];
    for (let li = questionLine; li < nextQLine; li++) {
      const annotationMatch = lines[li].trim().match(annotationRe);
      if (annotationMatch) {
        nearbyAnnotations.push(annotationMatch[1].trim());
      }
    }

    const titleParts: string[] = [matchedSection.name];
    if (nearbyAnnotations.length > 0) {
      titleParts.push(nearbyAnnotations[0]);
    }

    q.title = titleParts.join(' | ');
  }

  const withTitles = questions.filter(q => q.title).length;
  if (withTitles > 0) {
    const titles = [...new Set(questions.map(q => q.title).filter(Boolean))];
    console.log(`  [MinerU v4] 章节标题注入: ${withTitles}/${questions.length} 题, 章节: [${titles.join(', ')}]`);
  }
}

/**
 * 将 MinerU 结构化数据（blocks, formulas）匹配到已拆分的题目中
 * 填充 ParsedQuestion.formulas 和 ParsedQuestion.sourceBlocks
 */
function bridgeStructuredData(
  questions: ParsedQuestion[],
  structured: StructuredOcrData,
): void {
  for (const q of questions) {
    // 合并题干+答案+解析，去空格和转小写做模糊匹配
    const qContent = (q.content + (q.answer || '') + (q.analysis || ''))
      .replace(/\s+/g, '')
      .toLowerCase();

    // 匹配公式：检查公式 LaTeX（去空格）是否出现在题目内容中
    const matchedFormulas = structured.formulas.filter(f =>
      qContent.includes(f.latex.replace(/\s+/g, '').toLowerCase()),
    );
    if (matchedFormulas.length > 0) {
      q.formulas = JSON.stringify(matchedFormulas);
    }

    // 匹配源块：按文本内容前缀匹配（去空格，取前 50 字符）
    const matchedBlocks = structured.blocks.filter(b => {
      const bText = (b.text || '').trim();
      if (bText.length < 5) return false;
      const normalized = bText.replace(/\s+/g, '').toLowerCase().substring(0, 50);
      return normalized.length > 3 && qContent.includes(normalized);
    });

    if (matchedBlocks.length > 0) {
      q.sourceBlocks = JSON.stringify(
        matchedBlocks.map(({ type, text, bbox, pageIdx, textLevel, imgPath }) => ({
          type,
          text: (text || '').substring(0, 300),
          bbox,
          pageIdx,
          textLevel,
          imgPath,
        })),
      );
    }
  }

  const withFormulas = questions.filter(q => q.formulas).length;
  const withBlocks = questions.filter(q => q.sourceBlocks).length;
  console.log(`  [MinerU v4] 结构化桥接: ${withFormulas}/${questions.length} 题有公式, ${withBlocks}/${questions.length} 题有源块`);
}

// ============================================================
// OCR 结果缓存
// ============================================================

const OCR_CACHE_DIR = path.join(process.cwd(), 'uploads', 'ocr', '.cache');

function getCacheDir(): string {
  if (!fs.existsSync(OCR_CACHE_DIR)) {
    fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
  }
  return OCR_CACHE_DIR;
}

function computeFileHash(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

interface CachedOcrData {
  mdContent: string;
  contentList: ContentBlock[];
}

function readCache(hash: string): CachedOcrData | null {
  try {
    const metaPath = path.join(getCacheDir(), `${hash}.json`);
    const mdPath = path.join(getCacheDir(), `${hash}.md`);
    if (!fs.existsSync(metaPath) || !fs.existsSync(mdPath)) return null;

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const mdContent = fs.readFileSync(mdPath, 'utf-8');
    const contentList = meta.contentList as ContentBlock[];

    if (!mdContent || !Array.isArray(contentList)) return null;

    return { mdContent, contentList };
  } catch {
    return null;
  }
}

function writeCache(hash: string, mdContent: string, contentList: ContentBlock[]): void {
  try {
    const metaPath = path.join(getCacheDir(), `${hash}.json`);
    const mdPath = path.join(getCacheDir(), `${hash}.md`);
    fs.writeFileSync(mdPath, mdContent, 'utf-8');
    fs.writeFileSync(metaPath, JSON.stringify({ contentList }), 'utf-8');
  } catch (error) {
    console.warn('  [MinerU v4] 写入缓存失败:', error instanceof Error ? error.message : '未知');
  }
}

// ============================================================
// 主入口
// ============================================================

/**
 * 使用 MinerU v4 Precision Extract API 处理 PDF
 *
 * 缓存：以 PDF SHA256 为 key，命中则跳过 API 调用直接复用已保存的 MD + _content_list
 *
 * 双策略:
 *   1. 先尝试批量上传 + 自动任务（适合本地文件，无需公开URL）
 *   2. 若无法获取 task_id，回退到单文件 API（需要公开URL，适合部署环境）
 */
export async function processPDF(
  filePath: string,
  outputDir: string,
  options: MinerUOptions = {},
): Promise<MinerUResult> {
  const startTime = Date.now();
  const fileName = path.basename(filePath);

  try {
    console.log(`\n[MinerU v4] 处理: ${fileName}`);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    const fileHash = computeFileHash(filePath);

    // 检查缓存
    const cached = readCache(fileHash);
    if (cached) {
      console.log(`  [MinerU v4] ✓ 缓存命中 (SHA256: ${fileHash.substring(0, 12)}...)`);

      const structuredData: StructuredOcrData = {
        blocks: cached.contentList,
        formulas: extractFormulasFromBlocks(cached.contentList),
      };

      const questions = extractQuestions(cached.mdContent, structuredData);

      const elapsed = (Date.now() - startTime) / 1000;
      const pages = new Set(structuredData.blocks.map(b => b.pageIdx)).size;

      console.log(`  [MinerU v4] 完成(缓存): ${questions.length} 题, ${pages} 页, ${elapsed.toFixed(1)}s`);

      return {
        success: true,
        markdownContent: cached.mdContent,
        questions,
        structuredData,
        elapsed,
        pages,
      };
    }

    console.log(`  [MinerU v4] 缓存未命中，调用 API (SHA256: ${fileHash.substring(0, 12)}...)`);

    const safeName = fileName.replace(/[^a-zA-Z0-9\u4e00-\u9fff_.-]/g, '_');
    const ts = Date.now();
    const uniqueBase = `${ts}-${path.basename(safeName, '.pdf')}`;

    const mergedOpts: MinerUOptions = {
      model_version: 'vlm',
      is_ocr: true,
      enable_formula: true,
      enable_table: true,
      language: 'ch',
      ...options,
    };

    // 策略1: 批量上传 → 自动创建任务 → 轮询
    const uploadInfo = await requestUploadUrl(path.basename(filePath), mergedOpts);
    if (!uploadInfo) {
      return { success: false, error: '获取上传URL失败' };
    }

    const uploaded = await uploadFile(filePath, uploadInfo.signedUrl);
    if (!uploaded) {
      return { success: false, error: '文件上传失败' };
    }

    // 等待系统自动创建任务（批量上传不暴露task_id，此路径仅上传文件到OSS）
    await new Promise(r => setTimeout(r, 3000));

    // 尝试从 OSS URL 构造公开可读 URL
    // OSS 文件不可公开读取，直接走公开URL方案
    let taskResult: TaskStatusResponse['data'] | null = null;

    // 尝试公开URL方案：复制到 public/ 或上传到临时托管
    console.log('  [MinerU v4] 使用公开URL方案提交提取任务...');

    let publicUrl: string | null = null;

    // 先尝试通过临时文件托管服务获取公开URL
    publicUrl = await uploadToTmpHost(filePath);
    if (!publicUrl) {
      // 回退: 复制到 public/ 目录（仅生产环境有效）
      const publicDir = path.join(process.cwd(), 'public', 'uploads', 'ocr');
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
      const publicFileName = `${uniqueBase}.pdf`;
      fs.copyFileSync(filePath, path.join(publicDir, publicFileName));
      publicUrl = `${APP_BASE_URL}/uploads/ocr/${publicFileName}`;
    }

    console.log(`  [MinerU v4] 公开URL: ${publicUrl}`);

    const urlTaskId = await createTaskViaUrl(publicUrl, mergedOpts);
    if (!urlTaskId) {
      return { success: false, error: '创建提取任务失败' };
    }

    taskResult = await pollTask(urlTaskId, 600000);

    if (!taskResult) {
      return { success: false, error: '任务处理失败或超时' };
    }

    if (!taskResult.full_zip_url) {
      return { success: false, error: taskResult.err_msg || '未返回结果URL' };
    }

    // 下载并解压
    const extractDir = await downloadAndExtract(taskResult.full_zip_url, outputDir, uniqueBase);
    if (!extractDir) {
      return { success: false, error: '下载结果失败' };
    }

    // 读取结果
    const mdContent = readMarkdown(extractDir);
    if (!mdContent) {
      return { success: false, error: '读取识别结果失败' };
    }

    // 保存原始MD
    const mdPath = path.join(outputDir, `${uniqueBase}-full.md`);
    fs.writeFileSync(mdPath, mdContent, 'utf-8');
    console.log(`  [MinerU v4] 原始MD已保存: ${mdPath}`);

    // 保存全部输出文件
    saveAllOutputFiles(extractDir, outputDir, uniqueBase);

    // 结构化数据
    const structuredData = readStructuredData(extractDir);
    if (structuredData) {
      console.log(`  [MinerU v4] Block: ${structuredData.blocks.length}, 公式: ${structuredData.formulas.length}`);
    }

    // 写入 OCR 结果缓存
    if (structuredData) {
      writeCache(fileHash, mdContent, structuredData.blocks);
    }

    // 题目识别
    const questions = extractQuestions(mdContent, structuredData);

    // 将图片路径转换为 <uniqueBase>/images/xxx.jpg
    //  确保多份 PDF 的同名图片（如 1.jpg）不会冲突，API 可按目录精确查找
    //  兼容扁平（images/xxx.jpg）和嵌套（subdir/images/xxx.jpg）两种目录结构
    for (const q of questions) {
      q.content = q.content.replace(
        /!\[([^\]]*)\]\((.+?\/)?images\/(.+?)\)/g,
        (_, alt: string, _prefix: string, file: string) => `![${alt}](${uniqueBase}/images/${file})`,
      );
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const pages = structuredData
      ? new Set(structuredData.blocks.map(b => b.pageIdx)).size
      : undefined;

    console.log(`  [MinerU v4] 完成: ${questions.length} 题, ${pages ?? '?'} 页, ${elapsed.toFixed(1)}s`);

    return {
      success: true,
      markdownContent: mdContent,
      questions,
      structuredData: structuredData ?? undefined,
      elapsed,
      pages,
      savedDir: extractDir,
    };
  } catch (error) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error(`[MinerU v4] 失败 (${elapsed.toFixed(1)}s):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理失败',
      elapsed,
    };
  }
}

export async function processPDFBatch(
  filePaths: string[],
  outputDir: string,
  options: MinerUOptions = {},
): Promise<MinerUResult[]> {
  const results: MinerUResult[] = [];
  for (const fp of filePaths) {
    results.push(await processPDF(fp, outputDir, options));
  }
  return results;
}
