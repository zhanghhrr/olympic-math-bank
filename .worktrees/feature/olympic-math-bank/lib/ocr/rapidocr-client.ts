/**
 * RapidOCR 本地客户端
 *
 * PDF → PyMuPDF 图片 → docling 版面分析 + RapidOCR → MD/JSON
 *
 * 调用 lib/ocr/pdf2md_rapidocr.py（本地 Python 脚本），
 * 输出格式兼容原有的 MinerUResult，可无缝替换链路。
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  HybridQuestionIdentifier,
  type ParsedQuestion,
} from './question-identifier';
import type { ContentBlock, ContentFormula, StructuredOcrData } from './mineru-client';

const PYTHON_CMD = process.platform === 'win32' ? 'py -3' : 'python3';
const SCRIPT_PATH = path.resolve(process.cwd(), 'lib/ocr/pdf2md_rapidocr.py');

const questionIdentifier = new HybridQuestionIdentifier();

export interface RapidOcrOptions {
  model?: 'mobile' | 'server';
  dpi?: number;
  keepImages?: boolean;
  pythonCmd?: string;
}

export interface RapidOcrResult {
  success: boolean;
  markdownContent?: string;
  questions?: ParsedQuestion[];
  structuredData?: StructuredOcrData;
  error?: string;
  elapsed?: number;
  pages?: number;
}

function writeTempPdf(inputPath: string, outputDir: string): string {
  const ts = Date.now();
  const baseName = path.basename(inputPath, '.pdf');
  const safeName = baseName.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_');
  const tmpName = `${ts}-${safeName}`;
  const tmpPath = path.join(outputDir, `${tmpName}.pdf`);
  const inputAbs = path.resolve(inputPath);
  const tmpAbs = path.resolve(tmpPath);

  if (inputAbs !== tmpAbs) {
    fs.copyFileSync(inputPath, tmpPath);
  }

  return tmpPath;
}

function findOutputFile(outputBase: string, extension: string): string | null {
  const directPath = `${outputBase}.${extension}`;
  if (fs.existsSync(directPath)) return directPath;

  const dirPath = outputBase;
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    const files = fs.readdirSync(dirPath);
    const match = files.find(f => f.endsWith(`.${extension}`));
    if (match) return path.join(dirPath, match);
  }

  return null;
}

function callPythonScript(
  pdfPath: string,
  outputDir: string,
  format: string,
  options: RapidOcrOptions,
): { mdPath: string; jsonPath: string } {
  const baseName = path.basename(pdfPath, '.pdf');
  const outputBase = path.join(outputDir, baseName);
  const cmdArgFormat = format;

  const cmdParts = [
    options.pythonCmd || PYTHON_CMD,
    `"${SCRIPT_PATH}"`,
    `"${pdfPath}"`,
    `--format ${cmdArgFormat}`,
    `--model ${options.model || 'mobile'}`,
    `--dpi ${options.dpi || 400}`,
    `-o "${outputBase}"`,
  ];

  if (options.keepImages) {
    cmdParts.push('--keep-images');
  }

  const cmd = cmdParts.join(' ');

  console.log(`  [RapidOCR] ${cmd}`);
  execSync(cmd, {
    stdio: 'pipe',
    encoding: 'utf-8',
    timeout: 600000,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
  });

  const mdPath = findOutputFile(outputBase, 'md');
  const jsonPath = findOutputFile(outputBase, 'json');

  return {
    mdPath: mdPath || `${outputBase}.md`,
    jsonPath: jsonPath || `${outputBase}.json`,
  };
}

/**
 * 从 docling export_to_dict() JSON 提取 ContentBlock[]
 */
function extractBlocksFromDoclingJson(jsonData: any): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const pageResults = jsonData.page_results;

  if (!Array.isArray(pageResults)) {
    return blocks;
  }

  for (let pi = 0; pi < pageResults.length; pi++) {
    const pageData = pageResults[pi];
    const items = extractItemsFromDoclingPage(pageData);

    for (const item of items) {
      blocks.push({
        type: mapDoclingType(item.type),
        text: item.text || '',
        textLevel: item.textLevel,
        bbox: item.bbox || [0, 0, 0, 0],
        pageIdx: pi,
        subType: item.subtype,
        listItems: item.listItems,
        imgPath: item.imgPath,
      });
    }
  }

  return blocks;
}

interface DoclingItem {
  type: string;
  text: string;
  textLevel?: number;
  bbox?: [number, number, number, number];
  subtype?: string;
  listItems?: string[];
  imgPath?: string;
}

function extractItemsFromDoclingPage(pageData: any): DoclingItem[] {
  const items: DoclingItem[] = [];
  const texts = pageData.texts;

  if (!Array.isArray(texts)) return items;

  for (const t of texts) {
    const label = (t.label || '').toLowerCase();

    items.push({
      type: label,
      text: t.text || t.orig || '',
      bbox: extractBBoxFromDocling(t),
      subtype: t.label,
    });
  }

  return items;
}

function extractBBoxFromDocling(item: any): [number, number, number, number] {
  const prov = item.prov;
  if (!Array.isArray(prov) || prov.length === 0) return [0, 0, 0, 0];

  const bbox = prov[0].bbox;
  if (!bbox) return [0, 0, 0, 0];

  const { l, t, r, b } = bbox;
  return [
    Math.round(l ?? 0),
    Math.round(t ?? 0),
    Math.round(r ?? 0),
    Math.round(b ?? 0),
  ];
}

function mapDoclingType(doclingType: string): ContentBlock['type'] {
  const t = (doclingType || '').toLowerCase();

  if (t.includes('list') || t.includes('enum') || t.includes('bullet')) return 'list';
  if (t.includes('table')) return 'table';
  if (t.includes('image') || t.includes('picture') || t.includes('figure')) return 'image';
  if (t.includes('formula') || t.includes('equation') || t.includes('math')) return 'formula';

  return 'text';
}

/**
 * 从 ContentBlock[] 提取公式
 * docling 的 formula_enrichment 可能以 \(...\) / $$...$$ 包裹
 */
const LNG_INLINE = /\\\(([^]*?)\\\)/g;
const LNG_DISPLAY = /\\\[([^]*?)\\\]/g;
const DOL_DISPLAY = /\$\$([^]*?)\$\$/g;
const DOL_INLINE = /\$([^\n]+?)\$/g;

function extractFormulasFromBlocks(blocks: ContentBlock[]): ContentFormula[] {
  const formulas: ContentFormula[] = [];

  for (const block of blocks) {
    if (block.type !== 'text' && block.type !== 'list' && block.type !== 'formula') continue;

    const text = block.text;
    if (!text) continue;

    for (const re of [LNG_DISPLAY, DOL_DISPLAY, LNG_INLINE, DOL_INLINE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        formulas.push({
          latex: m[1].trim(),
          bbox: [...block.bbox] as [number, number, number, number],
          page: block.pageIdx,
        });
      }
    }

    if (block.type === 'formula' && formulas.length === 0) {
      formulas.push({
        latex: text.trim(),
        bbox: [...block.bbox] as [number, number, number, number],
        page: block.pageIdx,
      });
    }
  }

  return formulas;
}

export async function processPDF(
  filePath: string,
  outputDir: string,
  options: RapidOcrOptions = {},
): Promise<RapidOcrResult> {
  const startTime = Date.now();

  try {
    console.log(`\n[RapidOCR] 处理PDF: ${path.basename(filePath)}`);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    const workPdf = writeTempPdf(filePath, outputDir);

    const { mdPath, jsonPath } = callPythonScript(
      workPdf,
      outputDir,
      'md,json',
      options,
    );

    if (!fs.existsSync(mdPath)) {
      return { success: false, error: 'Python 脚本未生成 Markdown 输出' };
    }

    const markdownContent = fs.readFileSync(mdPath, 'utf-8');

    let structuredData: StructuredOcrData | undefined;
    if (fs.existsSync(jsonPath)) {
      const jsonRaw = fs.readFileSync(jsonPath, 'utf-8');
      const jsonData = JSON.parse(jsonRaw);

      const blocks = extractBlocksFromDoclingJson(jsonData);
      const formulas = extractFormulasFromBlocks(blocks);

      structuredData = { blocks, formulas };
      console.log(`  [RapidOCR] 结构化数据: ${blocks.length} Block, ${formulas.length} 公式`);
    }

    console.log('[RapidOCR] 使用智能分割模式识别题目...');
    const blocks = questionIdentifier.splitContent(markdownContent);
    console.log(`[RapidOCR] 识别到 ${blocks.length} 个文本块`);

    for (let i = 0; i < Math.min(blocks.length, 20); i++) {
      const b = blocks[i];
      const content = (b.content || '').substring(0, 60).replace(/\n/g, '\\n');
      console.log(`  [Block ${i}] type=${b.type} hasAnswer=${!!b.answer} content="${content}..."`);
    }

    const questions = questionIdentifier.convertToQuestions(blocks);
    console.log(`[RapidOCR] 提取到 ${questions.length} 道有效题目`);

    const elapsed = (Date.now() - startTime) / 1000;

    return {
      success: true,
      markdownContent,
      questions,
      structuredData,
      elapsed,
      pages: structuredData
        ? new Set(structuredData.blocks.map(b => b.pageIdx)).size
        : undefined,
    };
  } catch (error) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error(`[RapidOCR] 失败 (${elapsed}s):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'RapidOCR 处理失败',
      elapsed,
    };
  }
}
