/**
 * RapidOCR 本地客户端 (备用 OCR 链路)
 *
 * 当 MinerU API 不可用或额度耗尽时，自动降级到本地 RapidOCR。
 * 通过 Node.js child_process 调用 Python 脚本 pdf2md_rapidocr.py，
 * 返回与 MinerU 兼容的 MinerUResult 格式，确保调用方无需修改。
 *
 * 使用方式（与 MinerU 完全一致）:
 *   const result = await processPDFWithRapidOCR(filePath, outputDir);
 *
 * 注意:
 *   - RapidOCR 对数学公式的支持有限，公式识别精度不如 MinerU
 *   - 建议在 MinerU 不可用时作为兜底方案，确保系统可用性
 *   - 首次运行会自动检查 Python 环境和依赖是否就绪
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  type MinerUResult,
  type ContentBlock,
  type ContentFormula,
  type StructuredOcrData,
} from './mineru-client';
import { HybridQuestionIdentifier, type ParsedQuestion } from './question-identifier';

// ---- Python 环境检测 ----

let pythonCheckCache: { available: boolean; reason?: string } | null = null;

/** 检查 Python 和 RapidOCR 依赖是否就绪（缓存结果） */
export async function checkRapidOCR(): Promise<{ available: boolean; reason?: string }> {
  if (pythonCheckCache) return pythonCheckCache;

  // 检查 Python 是否存在
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('python', ['--version'], { stdio: 'pipe' });
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      proc.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 5000);
    });
  } catch {
    pythonCheckCache = { available: false, reason: 'Python 未安装或不在 PATH 中' };
    return pythonCheckCache;
  }

  // 检查依赖脚本是否存在
  const scriptPath = path.join(__dirname, 'pdf2md_rapidocr.py');
  if (!fs.existsSync(scriptPath)) {
    pythonCheckCache = { available: false, reason: `脚本缺失: ${scriptPath}` };
    return pythonCheckCache;
  }

  // 检查依赖包是否安装
  try {
    const output = await runPython(['-c', `
import importlib
deps = ['rapidocr_onnxruntime', 'pdf2image', 'PIL']
missing = [d for d in deps if importlib.util.find_spec(d) is None]
if missing:
    print('MISSING:' + ','.join(missing), flush=True)
else:
    print('OK', flush=True)
    `]);
    if (output.startsWith('MISSING:')) {
      const missing = output.replace('MISSING:', '');
      pythonCheckCache = {
        available: false,
        reason: `缺少 Python 依赖: ${missing}。运行: pip install rapidocr-onnxruntime pdf2image pillow`,
      };
      return pythonCheckCache;
    }
  } catch {
    pythonCheckCache = { available: false, reason: 'Python 依赖检测失败' };
    return pythonCheckCache;
  }

  pythonCheckCache = { available: true };
  return pythonCheckCache;
}

// ---- 工具函数 ----

/** 执行 Python 命令并返回 stdout */
function runPython(args: string[], options?: { cwd?: string; timeout?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', args, {
      cwd: options?.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8');
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8');
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Python 脚本超时 (${(options?.timeout ?? 300000) / 1000}s)`));
    }, options?.timeout ?? 300000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Python 进程退出码: ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

const questionIdentifier = new HybridQuestionIdentifier();

/**
 * 使用 RapidOCR 处理 PDF 文件
 *
 * @param filePath  PDF 文件路径
 * @param outputDir  输出目录（预留，当前未使用）
 * @param options    可选参数（预留）
 * @returns 与 MinerU processPDF 相同格式的结果
 */
export async function processPDFWithRapidOCR(
  filePath: string,
  outputDir: string,
  options: { dpi?: number } = {},
): Promise<MinerUResult> {
  const startTime = Date.now();
  const fileName = path.basename(filePath);

  // 检查依赖就绪
  const check = await checkRapidOCR();
  if (!check.available) {
    return { success: false, error: `RapidOCR 不可用: ${check.reason}` };
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, error: '文件不存在' };
  }

  const scriptPath = path.join(__dirname, 'pdf2md_rapidocr.py');

  try {
    console.log(`[RapidOCR] 处理: ${fileName}`);

    const args = [scriptPath, filePath];
    if (options.dpi) args.push('--dpi', String(options.dpi));

    // 调用 Python 脚本（5 分钟超时）
    const rawJson = await runPython(args, { timeout: 5 * 60 * 1000 });

    const parsed = JSON.parse(rawJson);

    if (!parsed.success) {
      return { success: false, error: parsed.error || 'RapidOCR 识别失败' };
    }

    // 构建 StructuredOcrData（兼容 MinerU 格式）
    const blocks: ContentBlock[] = (parsed.blocks || []).map((b: any) => ({
      type: b.type || 'text',
      text: b.text || '',
      bbox: b.bbox || [0, 0, 0, 0],
      pageIdx: b.pageIdx ?? 0,
    }));

    const formulas: ContentFormula[] = (parsed.formulas || []).map((f: any) => ({
      latex: f.latex || '',
      bbox: f.bbox || [0, 0, 0, 0],
      page: f.page ?? 0,
    }));

    const structuredData: StructuredOcrData = { blocks, formulas };

    // 题目识别（复用 MinerU 链路的同一识别器）
    const mdContent: string = parsed.mdContent || blocks.map(b => b.text).join('\n\n');
    const questions = extractQuestions(mdContent, structuredData);

    const elapsed = (Date.now() - startTime) / 1000;
    const pages = parsed.pages ?? new Set(blocks.map(b => b.pageIdx)).size;

    console.log(`[RapidOCR] 完成: ${questions.length} 题, ${pages} 页, ${elapsed.toFixed(1)}s`);

    return {
      success: true,
      markdownContent: mdContent,
      questions,
      structuredData,
      elapsed,
      pages,
    };
  } catch (error) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error(`[RapidOCR] 失败 (${elapsed.toFixed(1)}s):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'RapidOCR 处理失败',
      elapsed,
    };
  }
}

// ---- 内部：题目识别（与 MinerU client 复用同一逻辑） ----

function extractQuestions(
  mdContent: string,
  structuredData?: StructuredOcrData,
): ParsedQuestion[] {
  try {
    // 使用题目识别器分割 MD 内容
    const blockList = questionIdentifier.splitContent(mdContent);

    if (blockList.length === 0) {
      console.warn('[RapidOCR] 未识别到题目块，将全文作为单题处理');
      return [{
        content: mdContent.substring(0, 5000),
        type: '解答题',
        formulas: structuredData?.formulas?.length
          ? JSON.stringify(structuredData.formulas)
          : undefined,
        sourceBlocks: structuredData?.blocks?.length
          ? JSON.stringify(structuredData.blocks)
          : undefined,
      }];
    }

    const questions = questionIdentifier.convertToQuestions(blockList);

    // 为每道题注入公式和源块信息
    if (structuredData) {
      for (const q of questions) {
        bridgeStructuredData(q, structuredData);
      }
    }

    return questions;
  } catch (error) {
    console.error('[RapidOCR] 题目识别异常:', error);
    return [];
  }
}

/**
 * 将结构化数据（blocks, formulas）关联到题目
 * 与 MinerU client 的 bridgeStructuredData 逻辑保持一致
 */
function bridgeStructuredData(
  question: ParsedQuestion,
  structuredData: StructuredOcrData,
): void {
  const contentLower = (question.content || '').toLowerCase();

  // 关联公式：匹配 LaTeX 子串
  if (structuredData.formulas?.length) {
    const matchedFormulas = structuredData.formulas.filter(f => {
      if (!f.latex) return false;
      const latexLower = f.latex.toLowerCase();
      // 提取 LaTeX 核心内容用于匹配（去掉 \left, \right 等装饰）
      const core = latexLower.replace(/\\left|\\right|\\displaystyle/g, '').trim();
      return contentLower.includes(core) || contentLower.includes(latexLower);
    });
    if (matchedFormulas.length > 0) {
      question.formulas = JSON.stringify(matchedFormulas);
    }
  }

  // 关联源块：按文本内容匹配
  if (structuredData.blocks?.length) {
    const matchedBlocks = structuredData.blocks.filter(b => {
      if (!b.text || b.text.length < 3) return false;
      return contentLower.includes(b.text.toLowerCase());
    });
    if (matchedBlocks.length > 0) {
      question.sourceBlocks = JSON.stringify(matchedBlocks);
    }
  }
}
