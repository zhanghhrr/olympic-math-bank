/**
 * 公式校验流水线
 * 对 OCR 提取的 LaTeX 公式进行语法校验和可信度评估
 *
 * 校验层级:
 *   1. 语法校验: 用 KaTeX 渲染 → 检测渲染错误（缺括号、非法命令等）
 *   2. 结构启发: 检测概率性错误（如 & 分隔符丢失、\left 配对不完整）
 *   3. 交叉验证: 如果同一公式出现多次，检查是否一致
 *   4. (未来) 像素比对: 渲染公式 → 截取原 PDF 区域 → 像素相似度
 */

import katex from 'katex';
import { compareFormulas, isSimpletexAvailable, getCompareSummary, type DiffResult } from './dual-verifier';

export type VerifyStatus = 'ok' | 'warning' | 'error' | 'unchecked';

export interface VerifiedFormula {
  latex: string;
  bbox: [number, number, number, number];
  page: number;
  verifyStatus: VerifyStatus;
  verifyDetail: string;
  renderedHtml?: string;
  compare?: DiffResult;
}

export interface VerifyResult {
  totalFormulas: number;
  okCount: number;
  warningCount: number;
  errorCount: number;
  formulas: VerifiedFormula[];
}

interface RawFormula {
  latex: string;
  bbox: [number, number, number, number];
  page: number;
}

/**
 * 单条公式的 KaTeX 语法校验
 */
function verifyFormulaSyntax(latex: string): { ok: boolean; detail: string } {
  try {
    katex.renderToString(latex, {
      throwOnError: false,
      strict: false,
      displayMode: true,
    });
    return { ok: true, detail: '' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, detail: msg };
  }
}

/**
 * 单条公式的启发式结构检查
 * 捕获 KaTeX 不报错但可能有问题的模式
 */
function heuristicCheck(latex: string): string[] {
  const warnings: string[] = [];

  // \left 无配对 \right
  const leftCount = (latex.match(/\\left/g) || []).length;
  const rightCount = (latex.match(/\\right/g) || []).length;
  if (leftCount !== rightCount) {
    warnings.push(`\\left/\\right 不配对: ${leftCount} left, ${rightCount} right`);
  }

  // 大括号配对
  const openBraces = (latex.match(/\{(?!\\)/g) || []).length;
  const closeBraces = (latex.match(/(?<!\\)\}/g) || []).length;
  if (openBraces !== closeBraces) {
    warnings.push(`大括号不配对: ${openBraces} {, ${closeBraces} }`);
  }

  // 超长公式(>300字符)可能有截断
  if (latex.length > 300) {
    warnings.push('超长公式(>300字符)，可能存在截断');
  }

  // 常见 OCR 错误模式
  if (/\\begin\{[^}]+\}/.test(latex) && !/\\end\{[^}]+\}/.test(latex)) {
    warnings.push('\\begin 无配对 \\end');
  }
  if (/\\end\{[^}]+\}/.test(latex) && !/\\begin\{[^}]+\}/.test(latex)) {
    warnings.push('\\end 无配对 \\begin');
  }

  return warnings;
}

/**
 * 校验单条公式
 */
function verifySingleFormula(formula: RawFormula): VerifiedFormula {
  const syntaxResult = verifyFormulaSyntax(formula.latex);
  const heuristics = heuristicCheck(formula.latex);

  if (!syntaxResult.ok) {
    return {
      ...formula,
      verifyStatus: 'error',
      verifyDetail: `KaTeX语法错误: ${syntaxResult.detail}`,
    };
  }

  if (heuristics.length > 0) {
    return {
      ...formula,
      verifyStatus: 'warning',
      verifyDetail: heuristics.join('; '),
    };
  }

  return {
    ...formula,
    verifyStatus: 'ok',
    verifyDetail: '',
  };
}

/**
 * 交叉验证：检查同一公式在文档中多次出现时是否一致
 * 不一致通常意味着某处 OCR 出错
 */
function crossVerifyFormulas(formulas: VerifiedFormula[]): VerifiedFormula[] {
  const result = [...formulas];

  for (let i = 0; i < result.length; i++) {
    if (result[i].verifyStatus !== 'error') continue;

    for (let j = 0; j < result.length; j++) {
      if (i === j) continue;
      if (result[j].verifyStatus === 'error') continue;

      const normalized = (s: string) => s.replace(/\s+/g, ' ').trim();
      if (normalized(result[i].latex) === normalized(result[j].latex)) {
        result[j].verifyStatus = 'warning';
        result[j].verifyDetail = result[j].verifyDetail
          ? `${result[j].verifyDetail}; 交叉验证: 同公式另处有语法错误`
          : '交叉验证: 同公式另处有语法错误';
      }
    }
  }

  return result;
}

/**
 * 主校验入口
 * 输入从 OCR 提取的公式列表，输出校验结果
 */
export function verifyFormulas(
  rawFormulas: RawFormula[],
  simpletexFormulas?: string[],
): VerifyResult {
  const verified = rawFormulas.map(verifySingleFormula);
  const crossVerified = crossVerifyFormulas(verified);

  if (simpletexFormulas && simpletexFormulas.length > 0 && isSimpletexAvailable()) {
    for (let i = 0; i < crossVerified.length; i++) {
      crossVerified[i].compare = compareFormulas(
        crossVerified[i].latex,
        simpletexFormulas[i],
      );
    }
  }

  const okCount = crossVerified.filter(f => f.verifyStatus === 'ok').length;
  const warningCount = crossVerified.filter(f => f.verifyStatus === 'warning').length;
  const errorCount = crossVerified.filter(f => f.verifyStatus === 'error').length;

  return {
    totalFormulas: crossVerified.length,
    okCount,
    warningCount,
    errorCount,
    formulas: crossVerified,
  };
}

/**
 * 从 JSON 字符串解析公式列表并校验
 */
export function verifyFormulasFromJson(formulasJson: string): VerifyResult | null {
  try {
    const raw = JSON.parse(formulasJson);
    if (!Array.isArray(raw)) return null;

    return verifyFormulas(raw as RawFormula[]);
  } catch {
    return null;
  }
}

/**
 * 获取公式校验摘要文本
 */
export function getVerifySummary(result: VerifyResult): string {
  if (result.totalFormulas === 0) return '无公式';

  const errorRate = ((result.errorCount / result.totalFormulas) * 100).toFixed(0);
  const warningRate = ((result.warningCount / result.totalFormulas) * 100).toFixed(0);

  if (result.errorCount === 0 && result.warningCount === 0) {
    return `全部通过 (${result.totalFormulas} 条公式)`;
  }

  const parts: string[] = [];
  if (result.errorCount > 0) parts.push(`${result.errorCount} 条错误(${errorRate}%)`);
  if (result.warningCount > 0) parts.push(`${result.warningCount} 条警告(${warningRate}%)`);

  return `${parts.join(', ')} / 共 ${result.totalFormulas} 条公式`;
}

/**
 * 将校验结果序列化为 JSON（更新 verifyStatus + verifyDetail 到原公式 JSON）
 */
export function serializeVerifiedFormulas(result: VerifyResult): string {
  return JSON.stringify(result.formulas);
}
