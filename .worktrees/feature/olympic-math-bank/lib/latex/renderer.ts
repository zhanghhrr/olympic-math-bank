/**
 * 共享 KaTeX 渲染器 — 参考教研云 MathJax 配置优化。
 *
 * 教研云的关键优化：
 *   1. 内联公式自动注入 \displaystyle（让分数/求和等符号可读）
 *   2. noErrors.js / noUndefined.js → 对应 KaTeX 的 strict: false
 *   3. SVG linebreaks → 通过 CSS overflow-x: auto 兜底
 *
 * 使用方式：
 *   import { renderLatexToHtml } from '@/lib/latex/renderer';
 *   const html = renderLatexToHtml(mixedContent);
 */

import katex from 'katex';
import { LATEX_MACROS } from './macros';

/** KaTeX 渲染统一配置：宽容忍错 + 宏定义 */
const SHARED_OPTIONS: Omit<katex.KatexOptions, 'displayMode'> = {
  throwOnError: false,
  strict: false, // 等同于 MathJax 的 noErrors / noUndefined
  macros: LATEX_MACROS,
  trust: true,
};

/**
 * 渲染混合 LaTeX + 文本内容到 HTML。
 *
 * 支持 4 种分隔符，全部使用行内渲染 + \displaystyle 注入：
 *   $$...$$  → displayMode: false + \displaystyle 注入
 *   \[...\]  → displayMode: true  （仅此一个块级）
 *   \(...\)  → displayMode: false + \displaystyle 注入
 *   $...$    → displayMode: false + \displaystyle 注入
 *
 * 教研云通过 prefilterHooks 对非 display 公式注入 \displaystyle，
 * 此处等效实现：在 inline 渲染时先包裹 \displaystyle{}。
 */
export function renderLatexToHtml(text: string): string {
  if (!text) return text;

  // 行内公式：$$...$$ —— 与 $...$ 一致，行内渲染 + \displaystyle 注入
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    try {
      return katex.renderToString(`\\displaystyle{${latex.trim()}}`, { ...SHARED_OPTIONS, displayMode: false });
    } catch {
      return `$$${latex}$$`;
    }
  });

  // 块级公式：\[...\]
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { ...SHARED_OPTIONS, displayMode: true });
    } catch {
      return `\\[${latex}\\]`;
    }
  });

  // 行内公式：\(...\) —— 注入 \displaystyle（参考教研云 prefilterHooks）
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => {
    try {
      return katex.renderToString(`\\displaystyle{${latex.trim()}}`, { ...SHARED_OPTIONS, displayMode: false });
    } catch {
      return `\\(${latex}\\)`;
    }
  });

  // 行内公式：$...$ —— 注入 \displaystyle（参考教研云 prefilterHooks）
  text = text.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
    try {
      return katex.renderToString(`\\displaystyle{${latex.trim()}}`, { ...SHARED_OPTIONS, displayMode: false });
    } catch {
      return `$${latex}$`;
    }
  });

  // 填空占位符：4 个及以上连续下划线 → 渲染为下划线元素
  // 匹配 ___ 或 ____ 等，替换为带 CSS 样式的 span
  text = text.replace(/(_{4,})/g, (_match, underscores) => {
    // 根据下划线数量估算宽度（每个 _ 约 0.5em）
    const count = underscores.length;
    const widthEm = Math.max(2, count * 0.5);
    return `<span class="fill-blank" style="min-width:${widthEm}em"></span>`;
  });

  // 换行符转 <br>
  return text.replace(/\n/g, '<br>');
}
