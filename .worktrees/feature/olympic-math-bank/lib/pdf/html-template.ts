/**
 * HTML 模板生成器 — 仿教研云方案：服务端 KaTeX 预渲染 + Puppeteer 输出 PDF。
 *
 * 替代 @react-pdf/renderer 方案，优势：
 * 1. 不需要自研 KaTeX SVG 解析器（删除 641 行 render-katex.ts）
 * 2. 浏览器原生 CSS 排版，支持 page-break、flexbox 等
 * 3. 与教研云 MathJax→SVG→PDF 管线等价，KaTeX 渲染质量更高
 */

import katex from 'katex';
import { LATEX_MACROS } from '@/lib/latex/macros';

// ============================================================
// 类型定义
// ============================================================

export interface QuestionData {
  id: string;
  content: string;       // Markdown + LaTeX 混合内容
  answer?: string | null;
  solution?: string | null;
  type: string;
}

export interface RenderBlock {
  id: string;
  type: 'MAIN_TITLE' | 'SUB_TITLE' | 'QUESTION' | 'PAGE_BREAK';
  content?: string;
  question?: QuestionData;
}

type ExportMode = 'student' | 'teacher';

// ============================================================
// KaTeX 预渲染：将内容中的 $...$ / $$...$$ 替换为 KaTeX HTML
// ============================================================

/** KaTeX 渲染选项 */
const KATEX_OPTIONS: katex.KatexOptions = {
  throwOnError: false,
  strict: false,
  trust: true,
  macros: LATEX_MACROS,
};

/** 转义 HTML 特殊字符，防止 KaTeX 渲染后的文本被误解析 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 将混合 Markdown + LaTeX 的题目内容渲染为 HTML。
 * 处理流程：
 *   1. 提取 $$...$$ 行内公式 → katex.renderToString(displayMode: false) + \displaystyle
 *   2. 提取 $...$ 行内公式 → katex.renderToString(displayMode: false) + \displaystyle
 *   3. 普通文本转义后拼接
 *   4. Markdown 图片 ![]() → <img> 标签
 */
function renderContentToHtml(raw: string): string {
  if (!raw) return '';

  // 先处理图片：![alt](url) → <img>
  let html = raw.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:=([0-9]+)x([0-9]+)=|"([^"]+)")?)?\)/g,
    (_match, alt, src, w, h) => {
      const widthAttr = w ? ` width="${w}"` : '';
      const heightAttr = h ? ` height="${h}"` : '';
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || '')}"${widthAttr}${heightAttr} style="max-width:84mm;height:auto;" />`;
    },
  );

  // 行内公式 $$...$$ —— 与 $...$ 一致，行内渲染 + \displaystyle 注入
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_match, latex: string) => {
    try {
      return katex.renderToString(`\\displaystyle{${latex.trim()}}`, {
        ...KATEX_OPTIONS,
        displayMode: false,
      });
    } catch {
      return `$${escapeHtml(latex.trim())}$`;
    }
  });

  // 行内公式 $...$ —— 注入 \displaystyle（打印输出更需可读性）
  html = html.replace(/\$([^$\n]+?)\$/g, (_match, latex: string) => {
    try {
      return katex.renderToString(`\\displaystyle{${latex.trim()}}`, {
        ...KATEX_OPTIONS,
        displayMode: false,
      });
    } catch {
      return `$${escapeHtml(latex.trim())}$`;
    }
  });

  // 填空占位符：4 个及以上连续下划线 → 渲染为带边框的 span
  html = html.replace(/(_{4,})/g, (_match, underscores) => {
    const count = underscores.length;
    const widthEm = Math.max(2, count * 0.5);
    return `<span style="display:inline-block;min-width:${widthEm}em;border-bottom:1.5px solid #1a1a1a;margin:0 0.15em;vertical-align:baseline;position:relative;bottom:-0.1em"></span>`;
  });

  return html;
}

// ============================================================
// HTML 页面生成
// ============================================================

interface BuildHtmlOptions {
  blocks: RenderBlock[];
  mode: ExportMode;
  title?: string;
}

/**
 * 构建完整的试卷 HTML 页面。
 * 包含内联 KaTeX CSS + 打印 CSS，可直接被 Puppeteer 渲染为 PDF。
 */
export function buildExamHtml(options: BuildHtmlOptions): string {
  const { blocks, mode, title = '奥林匹克数学训练讲义' } = options;

  // 渲染题目内容为 HTML（KaTeX 预渲染）
  const processedBlocks = blocks.map((block) => {
    if (block.type === 'QUESTION' && block.question) {
      const q = block.question;
      return {
        ...block,
        question: {
          ...q,
          contentHtml: renderContentToHtml(q.content),
          answerHtml: renderContentToHtml(q.answer || ''),
          solutionHtml: renderContentToHtml(q.solution || ''),
        },
      };
    }
    if (block.type === 'MAIN_TITLE' || block.type === 'SUB_TITLE') {
      return { ...block, contentHtml: escapeHtml(block.content || '') };
    }
    return block;
  });

  // 渲染内容时跳过 PAGE_BREAK（在下面用 CSS page-break 替代手动分页）
  // 所有题目自然排列，由 Puppeteer 自动分页，PAGE_BREAK 强制换页
  let globalQuestionIndex = 0;

  const bodyHtml = processedBlocks
    .map((block: any) => {
      if (block.type === 'PAGE_BREAK') {
        // 强制分页标记：CSS page-break-after 实现
        return '<div class="force-page-break"></div>';
      }
      if (block.type === 'MAIN_TITLE') {
        return `<div class="main-title"><h1>${block.contentHtml || ''}</h1></div>`;
      }
      if (block.type === 'SUB_TITLE') {
        return `<div class="sub-title"><p>${block.contentHtml || ''}</p></div>`;
      }
      if (block.type === 'QUESTION' && block.question) {
        globalQuestionIndex++;
        const q = block.question;
        return `
        <div class="question-block avoid-break">
          <div class="question-row">
            <span class="question-number">${globalQuestionIndex}.</span>
            <div class="question-content">${q.contentHtml}</div>
          </div>
          ${mode === 'student' ? '<div class="answer-blank"></div>' : ''}
          ${mode === 'teacher' ? `
          <div class="teacher-box">
            <div class="answer-section">
              <span class="label-answer">答案</span>
              <div class="teacher-content">${q.answerHtml || '略'}</div>
            </div>
            ${q.solutionHtml ? `
            <div class="solution-section">
              <span class="label-solution">解析</span>
              <div class="teacher-content">${q.solutionHtml}</div>
            </div>` : ''}
          </div>` : ''}
        </div>`;
      }
      return '';
    })
    .join('\n');

  // KaTeX CSS（内联，无需 CDN）
  const katexCss = getKatexCss();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
/* ====== KaTeX 样式（内联） ====== */
${katexCss}

/* ====== 页面基础 ====== */
* { margin: 0; padding: 0; box-sizing: border-box; }
html { font-size: 16px; }
body {
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "SimSun", sans-serif;
  font-size: 12px;
  line-height: 1.8;
  color: #1a1a1a;
  /* 内容由 @page 边距控制，body 不再自己设边距 */
}

/* ====== 标题 ====== */
.main-title { margin-bottom: 12px; margin-top: 4px; }
.main-title h1 {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.05em;
}
.sub-title { margin-bottom: 10px; margin-top: 2px; }
.sub-title p {
  font-size: 14px;
  color: #4a4a4a;
  text-align: center;
  font-family: "KaiTi", "楷体", "SimKai", serif;
}

/* ====== 题目 ====== */
.question-block { margin-bottom: 4px; }
.question-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.question-number {
  width: 28px;
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
  margin-top: 1px;
}
.question-content {
  flex: 1;
  font-size: 12px;
  line-height: 1.8;
}
.question-content img {
  max-width: 100%;
  height: auto;
}

/* ====== KaTeX 公式显示 ====== */
.block-formula {
  text-align: center;
  margin: 6px 0;
}
.block-formula .katex-display {
  margin: 0 !important;
}
.block-formula-error {
  color: #dc2626;
  font-style: italic;
  text-align: left;
}
.question-content .katex {
  font-size: 1.05em;
}

/* ====== 学生版答题区 ====== */
.answer-blank {
  height: 4cm;
  border-top: 1px dashed #d1d5db;
  margin-top: 6px;
}

/* ====== 教师版答案/解析 ====== */
.teacher-box {
  margin-top: 10px;
  margin-left: 28px;
  padding: 8px 10px;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.label-answer, .label-solution {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  margin-bottom: 4px;
}
.label-answer {
  color: #dc2626;
  background: #fef2f2;
}
.label-solution {
  color: #2563eb;
  background: #eff6ff;
  margin-top: 8px;
}
.teacher-content {
  font-size: 11px;
  line-height: 1.6;
}

/* ====== 分页控制 ====== */
.force-page-break {
  page-break-after: always;
  break-after: page;
  height: 0;
  margin: 0;
  padding: 0;
}
.avoid-break {
  page-break-inside: avoid;
  break-inside: avoid;
}

/* ====== 打印设置（由 Puppeteer 遵循） ====== */
@media print {
  @page {
    size: A4;
    margin: 15mm;
  }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background: white;
  }
}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ============================================================
// KaTeX CSS 内联 + 字体 base64 嵌入
// 解决 Puppeteer 无头 Chromium 无法加载外部字体文件的问题
// ============================================================

let _cachedKatexCss: string | null = null;

function getKatexCss(): string {
  if (_cachedKatexCss) return _cachedKatexCss;

  const fs = require('fs');
  const path = require('path');

  const katexDir = path.resolve(process.cwd(), 'node_modules', 'katex', 'dist');
  const cssPath = path.join(katexDir, 'katex.min.css');
  const fontsDir = path.join(katexDir, 'fonts');

  let css = '';

  // 尝试读取完整的 katex.min.css
  if (fs.existsSync(cssPath)) {
    css = fs.readFileSync(cssPath, 'utf-8');
  }

  // 将 CSS 中的 url(fonts/...) 替换为内联 base64
  if (fs.existsSync(fontsDir)) {
    css = css.replace(
      /url\(fonts\/([^)]+)\)/g,
      (_match: string, filename: string) => {
        // 只用 .woff2 格式（体积最小，Chromium 完全支持）
        const fontPath = path.join(fontsDir, filename);
        if (!fs.existsSync(fontPath)) {
          // 尝试 .woff2 扩展名
          const woff2File = filename.replace(/\.(woff|ttf)$/, '.woff2');
          const woff2Path = path.join(fontsDir, woff2File);
          if (fs.existsSync(woff2Path)) {
            const data = fs.readFileSync(woff2Path);
            const b64 = data.toString('base64');
            return `url(data:font/woff2;base64,${b64})`;
          }
          return _match; // 保持原样
        }
        const data = fs.readFileSync(fontPath);
        const b64 = data.toString('base64');
        // 根据扩展名确定 MIME 类型
        const ext = path.extname(filename).toLowerCase();
        const mime = ext === '.woff2' ? 'font/woff2' : ext === '.woff' ? 'font/woff' : 'font/truetype';
        return `url(data:${mime};base64,${b64})`;
      },
    );
  }

  if (css.length > 0) {
    _cachedKatexCss = css;
    return _cachedKatexCss!;
  }

  // 极端回退：最小 KaTeX CSS（无字体，公式会走样）
  _cachedKatexCss = `
.katex{font:normal 1.21em serif;line-height:1.2;text-indent:0}
.katex .katex-html>.newline{display:block}
.katex .base{position:relative;display:inline-block;white-space:nowrap}
.katex .mfrac .frac-line{display:inline-block;width:100%;border-bottom-style:solid}
.katex .mathrm{font-style:normal}
.katex .mathit{font-style:italic}
.katex .mathbf{font-weight:bold}
.katex .sqrt>.root{margin-left:.27777778em;margin-right:-.55555556em}
.katex .delimcenter{position:relative}
.katex .accent>.vlist-t,.katex .op-limits>.vlist-t{text-align:center}
.katex-display{display:block;margin:1em 0;text-align:center}
`;
  return _cachedKatexCss;
}
