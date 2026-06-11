/**
 * LaTeX 公式规范化 — 将 OCR 或用户输入的快捷宏展开为标准 LaTeX。
 *
 * 用于导入流水线的后处理阶段，确保存储到数据库的公式是标准 LaTeX，
 * 后续人工修改仅需处理语义错误而无需修正公式格式。
 *
 * 规则：
 *   1. $...$ 和 $$...$$ 内的 \shortcut → 展开为标准 LaTeX 命令
 *   2. 不做语义校验（那是 formula-verifier 的职责）
 *   3. 非公式区域的普通文本不受影响
 */

import { LATEX_MACROS } from './macros';

// ---- 构建替换规则（按名称长度降序，避免前缀匹配问题） ----

/** 需要展开的宏列表：按快捷键名长度降序，长名优先匹配 */
const NORMALIZE_RULES: Array<[RegExp, string]> = [];

/** 初始化替换规则：只展开 val ≠ shortcut 的宏 */
function buildNormalizeRules(): void {
  if (NORMALIZE_RULES.length > 0) return;

  const entries = Object.entries(LATEX_MACROS)
    // 排除同义映射（如 \P → \P, \bold → \mathbf 这类在 LaTeX 中已等同的）
    .filter(([shortcut, expansion]) => {
      // \bold → \mathbf 在 LaTeX 中不等同，需要展开
      // 排除映射到自身或 unicode 转义的无意义宏
      if (expansion === `\\${shortcut}`) return false;
      if (expansion.startsWith('\\unicode{')) return false;
      if (shortcut === 'bold' && expansion === '\\mathbf') return true;
      return true;
    })
    // 按名称长度降序排列：长名优先匹配
    .sort((a, b) => b[0].length - a[0].length);

  for (const [shortcut, expansion] of entries) {
    // 匹配 \shortcut 后跟非字母字符、或行尾、或字符串尾
    // 例如 \R 在 \R^2 中匹配，但不在 \Real 中匹配
    const regex = new RegExp(`\\\\${escapeRegex(shortcut)}(?![a-zA-Z])`, 'g');
    NORMALIZE_RULES.push([regex, expansion]);
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- 核心规范化函数 ----

/**
 * 规范化一段 LaTeX 公式片段。
 * 将公式内的快捷宏（如 \R）展开为标准形式（如 \mathbb{R}）。
 */
export function normalizeFormula(formula: string): string {
  buildNormalizeRules();

  let result = formula;
  for (const [regex, expansion] of NORMALIZE_RULES) {
    result = result.replace(regex, expansion);
  }
  return result;
}

/**
 * 规范化混合内容（Markdown + LaTeX）中的公式。
 * 识别所有 $...$ 和 $$...$$ 公式块，分别规范化其内容。
 */
export function normalizeContent(raw: string): string {
  if (!raw) return raw;

  buildNormalizeRules();

  let result = raw;

  // 1. 处理块级公式 $$...$$
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_match, latex: string) => {
    return `$$${normalizeFormula(latex)}$$`;
  });

  // 2. 处理行内公式 $...$（不跨行）
  result = result.replace(/\$([^$\n]+?)\$/g, (_match, latex: string) => {
    return `$${normalizeFormula(latex)}$`;
  });

  return result;
}

/**
 * 批量规范化多个字段中的公式。
 * 用于导入流水线：内容、答案、解析三个字段都需要处理。
 */
export function normalizeQuestionFields(fields: {
  content: string;
  answer: string;
  solution: string;
}): { content: string; answer: string; solution: string } {
  return {
    content: normalizeContent(fields.content),
    answer: normalizeContent(fields.answer),
    solution: normalizeContent(fields.solution),
  };
}
