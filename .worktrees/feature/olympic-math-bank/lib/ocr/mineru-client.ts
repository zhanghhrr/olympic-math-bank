/**
 * MinerU OCR 客户端
 * 使用 HybridQuestionIdentifier 进行智能题目识别
 *
 * 注：原始的 Python 实现已备份到 scripts/web_pdf_converter.py
 * 此 TypeScript 版本是基于 Python 实现的移植
 *
 * v2: 新增 _content_list.json 解析，输出结构化 Block
 *    为后续公式校验和题目区域归属提供结构化数据
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { HybridQuestionIdentifier, type ParsedQuestion } from './question-identifier';

const MINERU_BASE_URL = 'https://opendatalab-mineru.ms.show';

// 创建识别器实例
const questionIdentifier = new HybridQuestionIdentifier();

export interface ContentBlock {
  type: 'text' | 'list' | 'image' | 'table' | 'formula';
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
}

// 重新导出 ParsedQuestion 类型
export { ParsedQuestion };

/**
 * 生成随机session hash
 */
function generateSessionHash(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 上传PDF文件到MinerU
 */
async function uploadPDF(filePath: string): Promise<string | null> {
  try {
    console.log('  [MinerU] 上传文件...');
    
    const formData = new FormData();
    formData.append('files', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: 'application/pdf',
    });
    
    const uploadUrl = `${MINERU_BASE_URL}/gradio_api/upload`;
    
    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://opendatalab-mineru.ms.show/',
        'Origin': 'https://opendatalab-mineru.ms.show',
      },
      timeout: 60000,
    });
    
    if (response.status === 200) {
      const data = response.data;
      if (Array.isArray(data) && data.length > 0) {
        console.log('  [MinerU] 上传成功');
        return data[0];
      } else if (data && data.path) {
        console.log('  [MinerU] 上传成功');
        return data.path;
      }
    }
    
    console.error('  [MinerU] 上传响应格式错误:', response.data);
    return null;
  } catch (error) {
    console.error('  [MinerU] 上传失败:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}

/**
 * 调用MinerU预测接口
 */
async function predictPDF(serverFilePath: string, fileName: string, fileSize: number): Promise<any> {
  try {
    console.log('  [MinerU] 开始识别...');
    
    const sessionHash = generateSessionHash();
    
    // 构造文件参数
    const fileArg = {
      path: serverFilePath,
      url: `${MINERU_BASE_URL}/file=${serverFilePath}`,
      orig_name: fileName,
      size: fileSize,
      mime_type: 'application/pdf',
      meta: { _type: 'gradio.FileData' }
    };
    
    // 构造payload (fn_index=8)
    const payload = {
      data: [
        fileArg,                                      // ID 5: File
        20,                                           // ID 8: Max pages
        false,                                        // ID 24: Force OCR
        true,                                         // ID 20: Formula Hybrid
        true,                                         // ID 19: Table Enable
        'ch (Chinese, English, Chinese Traditional)', // ID 23: OCR Language
        'vlm-auto-engine',                            // ID 11: Backend
        'http://localhost:30000'                      // ID 14: Server URL
      ],
      event_data: null,
      fn_index: 8,
      session_hash: sessionHash
    };
    
    const joinParams = {
      t: Date.now().toString(),
      __theme: 'dark',
      backend_url: '/'
    };
    
    const predictUrl = `${MINERU_BASE_URL}/gradio_api/queue/join`;
    
    const response = await axios.post(predictUrl, payload, {
      params: joinParams,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://opendatalab-mineru.ms.show/',
      },
      timeout: 120000,
    });
    
    if (response.status === 200) {
      const result = response.data;
      const eventId = result.event_id;
      
      if (eventId) {
        console.log(`  [MinerU] 任务已提交 (Event ID: ${eventId})`);
        // 等待结果
        return await waitForResult(sessionHash, eventId);
      }
    }
    
    console.error('  [MinerU] 预测失败:', response.status);
    return null;
  } catch (error) {
    console.error('  [MinerU] 预测失败:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}

/**
 * 等待MinerU处理结果
 */
async function waitForResult(sessionHash: string, eventId: string): Promise<any> {
  const dataUrl = `${MINERU_BASE_URL}/gradio_api/queue/data`;
  const maxAttempts = 60; // 最多等待60秒
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(dataUrl, {
        params: {
          session_hash: sessionHash,
          studio_token: ''
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 30000,
        responseType: 'text',
      });
      
      const lines = response.data.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const msg = JSON.parse(line.substring(6));
            
            if (msg.msg === 'process_completed') {
              return msg;
            } else if (msg.msg === 'process_failed') {
              console.error('  [MinerU] 处理失败:', msg);
              return null;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
      
      // 等待1秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`  [MinerU] 获取结果失败 (尝试 ${attempt + 1}/${maxAttempts}):`, 
        error instanceof Error ? error.message : '未知错误');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.error('  [MinerU] 等待结果超时');
  return null;
}

/**
 * 从MinerU结果中提取zip文件URL
 */
function extractZipUrl(result: any): string | null {
  if (!result || !result.output || !result.output.data) {
    return null;
  }
  
  const dataList = result.output.data;
  
  for (const item of dataList) {
    if (typeof item === 'object') {
      // 检查是否是文件更新指令
      if (item.__type__ === 'update' && item.value) {
        const value = Array.isArray(item.value) ? item.value[0] : item.value;
        if (value && (value.orig_name?.endsWith('.zip') || value.path?.endsWith('.zip'))) {
          return value.url || `${MINERU_BASE_URL}/file=${value.path}`;
        }
      }
      // 旧格式兼容
      if (item.path && (item.orig_name?.endsWith('.zip') || item.path?.endsWith('.zip'))) {
        return item.url || `${MINERU_BASE_URL}/file=${item.path}`;
      }
    }
  }
  
  return null;
}

/**
 * 下载并解压结果
 */
async function downloadResult(zipUrl: string, outputDir: string, fileName: string): Promise<string | null> {
  try {
    console.log('  [MinerU] 下载结果...');
    
    const response = await axios.get(zipUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    
    if (response.status === 200) {
      // 保存zip文件
      const zipPath = path.join(outputDir, `${fileName}.zip`);
      fs.writeFileSync(zipPath, response.data);
      
      // 解压
      const extractDir = path.join(outputDir, fileName);
      if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
      }
      
      // 使用系统unzip命令解压
      const { execSync } = require('child_process');
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'ignore' });
      
      // 删除zip文件
      fs.unlinkSync(zipPath);
      
      console.log('  [MinerU] 下载完成');
      return extractDir;
    }
    
    return null;
  } catch (error) {
    console.error('  [MinerU] 下载失败:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}

/**
 * 从解压后的目录读取markdown内容
 */
function readMarkdownContent(extractDir: string): string {
  try {
    // 查找markdown文件
    const files = fs.readdirSync(extractDir);
    const mdFile = files.find(f => f.endsWith('.md'));
    
    if (mdFile) {
      return fs.readFileSync(path.join(extractDir, mdFile), 'utf-8');
    }
    
    // 如果没有md文件，查找txt文件
    const txtFile = files.find(f => f.endsWith('.txt'));
    if (txtFile) {
      return fs.readFileSync(path.join(extractDir, txtFile), 'utf-8');
    }
    
    return '';
  } catch (error) {
    console.error('  [MinerU] 读取结果失败:', error);
    return '';
  }
}

/**
 * 从解压目录读取 _content_list.json
 * 提取所有结构化 Block（含 BBox、类型、页码）
 */
function readContentListJson(extractDir: string): ContentBlock[] | null {
  try {
    const files = fs.readdirSync(extractDir);
    const jsonFile = files.find(f => f.endsWith('_content_list.json'));

    if (!jsonFile) {
      console.log('  [MinerU] 未找到 _content_list.json，跳过结构化提取');
      return null;
    }

    const raw = fs.readFileSync(path.join(extractDir, jsonFile), 'utf-8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.map((item: any) => ({
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
  } catch (error) {
    console.error('  [MinerU] 读取 _content_list.json 失败:', error);
    return null;
  }
}

/**
 * LaTeX 公式匹配模式
 * 匹配 MinerU 输出的 \(...\) 和 \[...\] 格式
 */
const LATEX_INLINE = /\\\(([^]*?)\\\)/g;
const LATEX_DISPLAY = /\\\[([^]*?)\\\]/g;

/**
 * 从 ContentBlock 数组中提取所有公式及其 BBox
 * 公式在 MinerU 输出中被包裹在 \(...\) 或 \[...\] 中
 */
function extractFormulasFromBlocks(blocks: ContentBlock[]): ContentFormula[] {
  const formulas: ContentFormula[] = [];

  for (const block of blocks) {
    if (block.type !== 'text' && block.type !== 'list') continue;

    const text = block.type === 'list'
      ? (block.listItems || []).join('\n')
      : block.text;

    let match: RegExpExecArray | null;

    LATEX_DISPLAY.lastIndex = 0;
    while ((match = LATEX_DISPLAY.exec(text)) !== null) {
      formulas.push({
        latex: match[1].trim(),
        bbox: [...block.bbox] as [number, number, number, number],
        page: block.pageIdx,
      });
    }

    LATEX_INLINE.lastIndex = 0;
    while ((match = LATEX_INLINE.exec(text)) !== null) {
      formulas.push({
        latex: match[1].trim(),
        bbox: [...block.bbox] as [number, number, number, number],
        page: block.pageIdx,
      });
    }

    if (block.type === 'list' && block.listItems) {
      for (const item of block.listItems) {
        LATEX_INLINE.lastIndex = 0;
        while ((match = LATEX_INLINE.exec(item)) !== null) {
          formulas.push({
            latex: match[1].trim(),
            bbox: [...block.bbox] as [number, number, number, number],
            page: block.pageIdx,
          });
        }
      }
    }
  }

  return formulas;
}

/**
 * 读取结构化 OCR 数据（_content_list.json → 结构化 Blocks + 公式列表）
 */
function readStructuredData(extractDir: string): StructuredOcrData | null {
  const blocks = readContentListJson(extractDir);
  if (!blocks) return null;

  const formulas = extractFormulasFromBlocks(blocks);
  return { blocks, formulas };
}

/**
 * 从markdown内容提取题目
 * 使用 HybridQuestionIdentifier 进行智能识别
 * @param markdown MinerU 输出的 Markdown 文本
 * @param structuredData 可选的结构化 OCR 数据（_content_list.json），用于增强分块和公式关联
 */
function extractQuestionsFromMarkdown(
  markdown: string,
  structuredData?: StructuredOcrData | null
): ParsedQuestion[] {
  console.log('[MinerU Client] 使用智能分割模式识别题目...');
  
  // 使用 HybridQuestionIdentifier 进行智能分割
  const blocks = questionIdentifier.splitContent(markdown);
  console.log(`[MinerU Client] 识别到 ${blocks.length} 个文本块`);
  
  // 转换为标准题目格式，传入结构化数据以关联公式和 BBox
  const questions = questionIdentifier.convertToQuestions(blocks);
  console.log(`[MinerU Client] 提取到 ${questions.length} 道有效题目`);
  
  return questions;
}

/**
 * 处理PDF文件（主函数）
 */
export async function processPDF(
  filePath: string,
  outputDir: string
): Promise<MinerUResult> {
  try {
    console.log(`\n处理PDF: ${path.basename(filePath)}`);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath, '.pdf');

    // 生成唯一时间戳，确保每次识别的中间产物不冲突
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;

    // 1. 上传文件
    const serverFilePath = await uploadPDF(filePath);
    if (!serverFilePath) {
      return { success: false, error: '上传失败' };
    }

    // 2. 调用预测
    const predictResult = await predictPDF(serverFilePath, path.basename(filePath), stats.size);
    if (!predictResult) {
      return { success: false, error: '识别失败' };
    }

    // 3. 提取zip URL
    const zipUrl = extractZipUrl(predictResult);
    if (!zipUrl) {
      return { success: false, error: '无法获取结果URL' };
    }

    // 4. 下载结果（使用时间戳确保唯一性）
    const extractDir = await downloadResult(zipUrl, outputDir, uniqueFileName);
    if (!extractDir) {
      return { success: false, error: '下载结果失败' };
    }

    // 5. 读取markdown内容
    const markdownContent = readMarkdownContent(extractDir);
    if (!markdownContent) {
      return { success: false, error: '读取结果失败' };
    }

    // 6. 保存原始markdown内容（带时间戳，避免覆盖）
    const markdownSavePath = path.join(outputDir, `${uniqueFileName}-raw.md`);
    fs.writeFileSync(markdownSavePath, markdownContent, 'utf-8');
    console.log(`  [MinerU] 原始内容已保存: ${markdownSavePath}`);

    // 7. 读取结构化数据（_content_list.json）
    const structuredData = readStructuredData(extractDir);
    if (structuredData) {
      console.log(`  [MinerU] 结构化数据: ${structuredData.blocks.length} 个 Block, ${structuredData.formulas.length} 个公式`);
    }

    // 8. 提取题目（传入结构化数据用于增强分块）
    const questions = extractQuestionsFromMarkdown(markdownContent, structuredData);

    console.log(`  [MinerU] 识别完成，共 ${questions.length} 道题目`);

    return {
      success: true,
      markdownContent,
      questions,
      structuredData: structuredData ?? undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}
