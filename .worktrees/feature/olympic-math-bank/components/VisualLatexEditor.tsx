'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import katex from 'katex';
import { LATEX_MACROS } from '@/lib/latex/macros';

/** KaTeX 渲染共享配置（编辑器预览用，不注入 \displaystyle） */
const EDITOR_KATEX_OPTIONS: Omit<katex.KatexOptions, 'displayMode'> = {
  throwOnError: false,
  strict: false,
  macros: LATEX_MACROS,
  trust: true,
};
import { LatexToolbar } from './LatexToolbar';

// ============ 类型定义 ============

type Segment =
  | { type: 'text'; content: string }
  | { type: 'latex'; content: string; displayMode: boolean; delimiter: '$' | '$$' }
  | { type: 'image'; url: string; alt: string; width: number; height: number; aspectRatio: number; align: 'left' | 'center' | 'right' }
  | { type: 'align'; align: 'left' | 'center' | 'right'; content: string };

interface VisualLatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

// ============ 工具函数 ============

function getImageUrl(path: string, baseUrl: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('images/')) {
    return `${baseUrl}/api/images/${path}`;
  }
  return `${baseUrl}/${path}`;
}

// 将 markdown 解析为 segments
function parseMarkdownToSegments(markdown: string): Segment[] {
  // 用数组存储所有内容项（包括图片和对齐块），最后按位置排序
  const allItems: { start: number; end: number; segment: Segment }[] = [];

  // 对齐块正则：:::left\n内容\n:::
  const alignRegex = /:::(\w+)\r?\n([\s\S]*?)\r?\n:::/g;
  const imageRegexWithSize = /!\[([^\]]*)\]\(([^)]+?)\s*=\s*(\d+)\s*x\s*(\d+)\s*=\)/g;
  const imageRegexWithoutSize = /!\[([^\]]*)\]\(([^)]+?)\)/g;

  // 收集所有对齐块
  let match;
  while ((match = alignRegex.exec(markdown)) !== null) {
    const alignType = match[1] as 'left' | 'center' | 'right';
    const content = match[2];
    allItems.push({
      start: match.index,
      end: match.index + match[0].length,
      segment: {
        type: 'align',
        align: alignType,
        content: content,
      },
    });
  }

  // 收集所有图片（带尺寸）
  while ((match = imageRegexWithSize.exec(markdown)) !== null) {
    const width = parseInt(match[3]) || 200;
    const height = parseInt(match[4]) || 150;
    // 检查是否在对齐块内
    const inAlignBlock = allItems.some(
      item => item.segment.type === 'align' && match!.index >= item.start && match!.index < item.end
    );
    if (!inAlignBlock) {
      allItems.push({
        start: match.index,
        end: match.index + match[0].length,
        segment: {
          type: 'image',
          alt: match[1] || '',
          url: match[2],
          width,
          height,
          aspectRatio: height / width,
          align: 'center',
        },
      });
    }
  }

  // 收集所有图片（不带尺寸）
  imageRegexWithoutSize.lastIndex = 0;
  while ((match = imageRegexWithoutSize.exec(markdown)) !== null) {
    // 检查是否已经在其他项中被处理
    const alreadyProcessed = allItems.some(
      item => match!.index >= item.start && match!.index < item.end
    );
    if (!alreadyProcessed) {
      const width = 200;
      const height = 150;
      allItems.push({
        start: match.index,
        end: match.index + match[0].length,
        segment: {
          type: 'image',
          alt: match[1] || '',
          url: match[2],
          width,
          height,
          aspectRatio: 0.75,
          align: 'center',
        },
      });
    }
  }

  // 按位置排序（确保正确的顺序）
  allItems.sort((a, b) => a.start - b.start);

  // 构建最终结果：按顺序处理
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const item of allItems) {
    // 处理当前项之前的文本
    if (item.start > lastIndex) {
      const text = markdown.slice(lastIndex, item.start);
      parseTextAndLatex(text, segments);
    }
    // 添加当前项（对齐块或图片）
    segments.push(item.segment);
    lastIndex = item.end;
  }

  // 处理最后剩余的文本
  if (lastIndex < markdown.length) {
    const text = markdown.slice(lastIndex);
    parseTextAndLatex(text, segments);
  }

  return segments;
}

// 解析纯文本和 LaTeX 公式
function parseTextAndLatex(text: string, segments: Segment[]) {
  if (!text) return;

  // 匹配 $$...$$ inline math
  const displayRegex = /\$\$[\s\S]*?\$\$/g;
  // 匹配 $...$ inline math（但不是 $$）
  const inlineRegex = /(?<!\$)\$(?!\$)[^$\n]+?\$(?!\$)/g;

  // 找到所有 LaTeX 位置
  const latexRanges: { start: number; end: number; content: string; displayMode: boolean; delimiter: '$' | '$$' }[] = [];

  let match;
  while ((match = displayRegex.exec(text)) !== null) {
    latexRanges.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0].slice(2, -2),
      displayMode: false,
      delimiter: '$$' as const,
    });
  }

  // 重置并找 inline
  inlineRegex.lastIndex = 0;
  while ((match = inlineRegex.exec(text)) !== null) {
    // 检查是否与已找到的 display 重叠
    const overlaps = latexRanges.some(
      r => match!.index >= r.start && match!.index < r.end
    );
    if (!overlaps) {
      latexRanges.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[0].slice(1, -1),
        displayMode: false,
        delimiter: '$' as const,
      });
    }
  }

  // 按位置排序
  latexRanges.sort((a, b) => a.start - b.start);

  // 提取文本片段（保留换行符，确保公式之间不粘连）
  let lastEnd = 0;
  for (const range of latexRanges) {
    if (range.start > lastEnd) {
      const textContent = text.slice(lastEnd, range.start);
      if (textContent.length > 0) {
        segments.push({ type: 'text', content: textContent });
      }
    }
    segments.push({ type: 'latex', content: range.content, displayMode: range.displayMode, delimiter: range.delimiter });
    lastEnd = range.end;
  }

  // 最后剩余的文本
  if (lastEnd < text.length) {
    const remaining = text.slice(lastEnd);
    if (remaining.length > 0) {
      segments.push({ type: 'text', content: remaining });
    }
  }
}

// 将 segments 转换为 markdown
function segmentsToMarkdown(segments: Segment[]): string {
  return segments.map(seg => {
    switch (seg.type) {
      case 'text':
        return seg.content;
      case 'latex':
        return seg.delimiter === '$$' ? `$$${seg.content}$$` : `$${seg.content}$`;
      case 'image':
        const hasSize = seg.width > 0 && seg.height > 0;
        return hasSize
          ? `![${seg.alt}](${seg.url} =${seg.width}x${seg.height}=)`
          : `![${seg.alt}](${seg.url})`;
      case 'align':
        return `:::${seg.align}\n${seg.content}\n:::`;
    }
  }).join('');
}

// 渲染 LaTeX 为 HTML
function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), { ...EDITOR_KATEX_OPTIONS, displayMode });
  } catch {
    return displayMode ? `$$${latex}$$` : `$${latex}$`;
  }
}

// ============ 渲染函数 ============

// 渲染编辑模式的 HTML - 确保内容正确分段落/换行
// 编辑模式下：对齐块、LaTeX 显示为纯文本源码，用户可直接编辑
function renderEditHtml(segments: Segment[], baseUrl: string): string {
  return segments.map((seg, index) => {
    const prevSeg = index > 0 ? segments[index - 1] : null;
    const nextSeg = index < segments.length - 1 ? segments[index + 1] : null;

    // 如果前一个不是换行符，且当前不是图片/文本开头，需要加换行
    const needLeadingBreak = prevSeg !== null && prevSeg.type !== 'text';
    // 如果当前不是图片/文本末尾，且下一个不是换行符，需要加换行
    const needTrailingBreak = nextSeg !== null && nextSeg.type !== 'text';

    switch (seg.type) {
      case 'text':
        // 文本保持原样，换行符会渲染为 <br>
        return seg.content.replace(/\n/g, '<br>');
      case 'latex':
        // 编辑模式下 LaTeX 显示为纯文本源码
        const latexText = seg.delimiter === '$$' ? `$$${seg.content}$$` : `$${seg.content}$`;
        const latexStyle = seg.displayMode
          ? 'display:block;font-family:monospace;background:#f3f4f6;padding:4px 8px;border-radius:4px;color:#7c3aed;margin:8px 0;white-space:pre-wrap;'
          : 'font-family:monospace;background:#f3f4f6;padding:0 4px;border-radius:2px;color:#7c3aed;white-space:pre-wrap;';
        return `${needLeadingBreak ? '<br>' : ''}<span class="latex-source" data-latex="${seg.content}" data-mode="${seg.displayMode ? 'display' : 'inline'}" data-delimiter="${seg.delimiter}" style="${latexStyle}">${latexText}</span>${needTrailingBreak ? '<br>' : ''}`;
      case 'image':
        const imgUrl = getImageUrl(seg.url, baseUrl);
        const alignStyle = seg.align === 'center' ? 'margin: 8px auto; display: block;' :
                          seg.align === 'right' ? 'margin: 8px 0 8px auto; display: block;' : 'margin: 8px 0; display: block;';
        return `${needLeadingBreak ? '<br>' : ''}<span class="image-wrapper" data-url="${seg.url}" data-alt="${seg.alt}" data-width="${seg.width}" data-height="${seg.height}" data-align="${seg.align}" style="position:relative;${alignStyle}width:${seg.width}px;height:${seg.height}px;"><img src="${imgUrl}" alt="${seg.alt}" data-url="${seg.url}" data-alt="${seg.alt}" data-width="${seg.width}" data-height="${seg.height}" data-align="${seg.align}" style="width:100%;height:100%;object-fit:contain;border:1px solid #e5e7eb;border-radius:4px;" /><span class="resize-handle" contentEditable="false" style="position:absolute;bottom:0;right:0;width:24px;height:24px;background:rgba(59,130,246,0.9);border-radius:4px 0 0 0;cursor:nwse-resize;display:flex;align-items:center;justify-content:center;z-index:10;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="9 3 3 3 3 9"/><polyline points="15 21 21 21 21 15"/><line x1="3" y1="9" x2="10" y2="16"/><line x1="21" y1="15" x2="14" y2="8"/></svg></span></span>${needTrailingBreak ? '<br>' : ''}`;
      case 'align':
        // 编辑模式下对齐块显示为可视化可编辑区域，带边框和背景标识
        const alignTextStyleMap: Record<string, string> = {
          left: 'text-align:left;',
          center: 'text-align:center;',
          right: 'text-align:right;',
        };
        const alignBgMap: Record<string, string> = {
          left: 'background:#f0f9ff;border-color:#3b82f6;',
          center: 'background:#f0f9ff;border-color:#8b5cf6;',
          right: 'background:#f0f9ff;border-color:#ef4444;',
        };
        const alignLabelMap: Record<string, string> = {
          left: '居左',
          center: '居中',
          right: '居右',
        };
        const alignTextStyle = alignTextStyleMap[seg.align] || 'text-align:left;';
        const alignBg = alignBgMap[seg.align] || '';
        const alignLabel = alignLabelMap[seg.align] || '居左';
        // 将内容解析为HTML以便在 contenteditable 中渲染
        const innerHtml = renderInnerHtml(seg.content, baseUrl);
        return `${needLeadingBreak ? '<br>' : ''}<div class="align-wrapper" data-align="${seg.align}" contentEditable="true" spellcheck="false" style="display:block;${alignTextStyle}${alignBg}padding:8px 12px;border-radius:6px;border:2px solid transparent;margin:8px 0;min-width:100px;position:relative;"><div style="position:absolute;top:-10px;left:8px;background:#fff;padding:0 6px;font-size:11px;color:#64748b;border-radius:3px;">${alignLabel}</div><div class="align-content" style="outline:none;${alignTextStyle}">${innerHtml}</div></div>${needTrailingBreak ? '<br>' : ''}`;
    }
  }).join('');
}

// 渲染对齐块内部内容为 HTML（递归处理内部的分段）
function renderInnerHtml(content: string, baseUrl: string): string {
  const segments = parseMarkdownToSegments(content);
  return segments.map(seg => {
    switch (seg.type) {
      case 'text':
        return seg.content.replace(/\n/g, '<br>');
      case 'latex':
        const latexText = seg.delimiter === '$$' ? `$$${seg.content}$$` : `$${seg.content}$`;
        const latexStyle = seg.displayMode
          ? 'display:block;font-family:monospace;background:#f3f4f6;padding:4px 8px;border-radius:4px;color:#7c3aed;margin:4px 0;white-space:pre-wrap;'
          : 'font-family:monospace;background:#f3f4f6;padding:0 4px;border-radius:2px;color:#7c3aed;white-space:pre-wrap;';
        return `<span class="latex-source" data-latex="${seg.content}" data-mode="${seg.displayMode ? 'display' : 'inline'}" data-delimiter="${seg.delimiter}" style="${latexStyle}">${latexText}</span>`;
      case 'image':
        const imgUrl = getImageUrl(seg.url, baseUrl);
        return `<span class="image-wrapper" data-url="${seg.url}" data-alt="${seg.alt}" data-width="${seg.width}" data-height="${seg.height}" data-align="${seg.align}" style="position:relative;display:inline-block;margin:4px;"><img src="${imgUrl}" alt="${seg.alt}" data-url="${seg.url}" data-alt="${seg.alt}" data-width="${seg.width}" data-height="${seg.height}" data-align="${seg.align}" style="width:${seg.width}px;height:${seg.height}px;object-fit:contain;border:1px solid #e5e7eb;border-radius:4px;" /><span class="resize-handle" contentEditable="false" style="position:absolute;bottom:0;right:0;width:20px;height:20px;background:rgba(59,130,246,0.9);border-radius:4px 0 0 0;cursor:nwse-resize;display:flex;align-items:center;justify-content:center;z-index:10;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="9 3 3 3 3 9"/><polyline points="15 21 21 21 21 15"/><line x1="3" y1="9" x2="10" y2="16"/><line x1="21" y1="15" x2="14" y2="8"/></svg></span></span>`;
      default:
        return seg.content;
    }
  }).join('');
}

// 渲染预览模式的 HTML - 确保内容正确分段落/换行
function renderPreviewHtml(segments: Segment[], baseUrl: string): string {
  return segments.map((seg, index) => {
    const prevSeg = index > 0 ? segments[index - 1] : null;
    const nextSeg = index < segments.length - 1 ? segments[index + 1] : null;

    // 只在非文本 segment 前后添加换行
    const needLeadingBreak = prevSeg !== null && prevSeg.type !== 'text';
    const needTrailingBreak = nextSeg !== null && nextSeg.type !== 'text';

    switch (seg.type) {
      case 'text':
        // 文本：直接渲染内容，换行由内容本身处理
        return seg.content.replace(/\n/g, '<br>');
      case 'latex':
        if (seg.displayMode) {
          return `${needLeadingBreak ? '<br>' : ''}<div class="latex-display" style="margin:12px 0;">${renderLatex(seg.content, true)}</div>${needTrailingBreak ? '<br>' : ''}`;
        }
        return `<span class="latex-inline">${renderLatex(seg.content, false)}</span>`;
      case 'image':
        const imgUrl = getImageUrl(seg.url, baseUrl);
        const alignStyle = seg.align === 'center' ? 'margin: 8px auto; display: block;' :
                          seg.align === 'right' ? 'margin: 8px 0 8px auto; display: block;' : 'margin: 8px 0; display: block;';
        const imgWidthStyle = seg.width > 0 ? `width:${seg.width}px;` : '';
        const imgHeightStyle = seg.height > 0 ? `height:${seg.height}px;` : '';
        return `${needLeadingBreak ? '<br>' : ''}<span style="${alignStyle}${imgWidthStyle}${imgHeightStyle}"><img src="${imgUrl}" alt="${seg.alt}" style="${imgWidthStyle}${imgHeightStyle}object-fit:contain;border:1px solid #e5e7eb;border-radius:4px;" class="preview-image" /></span>${needTrailingBreak ? '<br>' : ''}`;
      case 'align':
        // 解析对齐块内部内容并渲染为预览 HTML
        const innerSegments = parseMarkdownToSegments(seg.content);
        const innerHtml = innerSegments.map(innerSeg => {
          switch (innerSeg.type) {
            case 'text':
              return innerSeg.content.replace(/\n/g, '<br>');
            case 'latex':
              if (innerSeg.displayMode) {
                return `<div class="latex-display" style="margin:12px 0;">${renderLatex(innerSeg.content, true)}</div>`;
              }
              return `<span class="latex-inline">${renderLatex(innerSeg.content, false)}</span>`;
            case 'image':
              const innerImgUrl = getImageUrl(innerSeg.url, baseUrl);
              const innerImgWidthStyle = innerSeg.width > 0 ? `width:${innerSeg.width}px;` : '';
              const innerImgHeightStyle = innerSeg.height > 0 ? `height:${innerSeg.height}px;` : '';
              // 图片在 align-wrapper 内时，不需要自己的 margin 样式，外层 div 的 text-align 会控制位置
              // 只有独立图片才需要 margin 样式
              return `<img src="${innerImgUrl}" alt="${innerSeg.alt}" style="${innerImgWidthStyle}${innerImgHeightStyle}object-fit:contain;border:1px solid #e5e7eb;border-radius:4px;" class="preview-image" />`;
            default:
              return innerSeg.content;
          }
        }).join('');
        const flexJustify = seg.align === 'center' ? 'center' : seg.align === 'right' ? 'flex-end' : 'flex-start';
        return `<div style="display:flex;justify-content:${flexJustify};margin:8px 0;">${innerHtml}</div>`;
    }
  }).join('');
}

// ============ 主组件 ============

export function VisualLatexEditor({
  value,
  onChange,
  placeholder = '请输入内容...',
  rows = 6,
  className = '',
}: VisualLatexEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [draggingImage, setDraggingImage] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, width: 0, height: 0 });
  const [showResizeHint, setShowResizeHint] = useState<{ x: number; y: number; width: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  // 存储图片的自然比例（从 URL 到 aspectRatio 的映射）
  const imageAspectRatioMap = useRef<Record<string, number>>({});
  // 追踪已加载过比例的图片 URL
  const loadedUrlsRef = useRef<Set<string>>(new Set());
  // 标记是否已经初始化过编辑器内容（避免重复设置）
  const editorInitializedRef = useRef(false);
  // 拖动状态用 ref（同步更新）
  const draggingRef = useRef<{ url: string; startX: number; width: number; height: number } | null>(null);

  // 解析内容
  useEffect(() => {
    setSegments(parseMarkdownToSegments(value));
  }, [value]);

  // 当 isEditing 变为 true 时，设置编辑器内容
  useEffect(() => {
    if (!isEditing) return;

    // 使用 requestAnimationFrame 确保 DOM 已经渲染
    const timer = requestAnimationFrame(() => {
      if (editorRef.current) {
        const html = renderEditHtml(segments, baseUrl);
        editorRef.current.innerHTML = html;
        editorInitializedRef.current = true;
      }
    });
    return () => cancelAnimationFrame(timer);
  }, [isEditing, segments, baseUrl]);

  // 进入编辑模式
  const enterEditMode = useCallback(() => {
    // 先同步解析 segments
    const parsedSegments = parseMarkdownToSegments(value);
    setSegments(parsedSegments);

    // 预加载图片获取原比例
    parsedSegments.forEach(seg => {
      if (seg.type === 'image' && !loadedUrlsRef.current.has(seg.url)) {
        loadedUrlsRef.current.add(seg.url);
        const img = new Image();
        img.onload = () => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            imageAspectRatioMap.current[seg.url] = img.naturalHeight / img.naturalWidth;
          }
        };
        img.src = getImageUrl(seg.url, baseUrl);
      }
    });

    editorInitializedRef.current = false; // 允许 useEffect 设置内容
    setIsEditing(true);
  }, [value, baseUrl]);

  // 离开编辑模式
  const leaveEditMode = useCallback(() => {
    if (!editorRef.current) {
      setIsEditing(false);
      return;
    }
    // 从 DOM 解析内容
    const html = editorRef.current.innerHTML;
    const freshSegments = parseEditorHtml(html);
    const markdown = segmentsToMarkdown(freshSegments);
    // 立即更新 segments 状态，这样预览模式可以立即显示修改后的内容
    setSegments(freshSegments);
    onChange(markdown);
    editorInitializedRef.current = false;
    setIsEditing(false);
  }, [onChange]);

  // 处理输入 - 只在编辑模式下工作
  const handleInput = useCallback(() => {
    // 不在这里解析和更新 segments，避免重复渲染
    // 内容会在 leaveEditMode 时统一解析
  }, []);

  // 处理对齐块内部节点的辅助函数
  const processNodeForAlign = (node: Node, segments: Segment[]): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim()) {
        parseTextAndLatex(text, segments);
      } else if (text.includes('\n')) {
        // 纯换行文本也添加
        segments.push({ type: 'text', content: '\n' });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (el.classList.contains('latex-source')) {
        const storedLatex = el.getAttribute('data-latex') || '';
        const mode = el.getAttribute('data-mode') || 'inline';
        const isDisplay = mode === 'display';
        const storedDelimiter = (el.getAttribute('data-delimiter') || '$') as '$' | '$$';
        const displayText = el.textContent || '';
        const displayTrimmed = displayText.replace(/^\$\$|\$\$$/g, '');
        let latexContent = storedLatex;
        let delimiter: '$' | '$$' = storedDelimiter;

        if (displayTrimmed !== storedLatex) {
          if (displayText.startsWith('$$') && displayText.endsWith('$$')) {
            latexContent = displayText.slice(2, -2);
            delimiter = '$$';
          } else if (displayText.startsWith('$') && displayText.endsWith('$')) {
            latexContent = displayText.slice(1, -1);
            delimiter = '$';
          }
        }

        if (latexContent.trim()) {
          segments.push({ type: 'latex', content: latexContent, displayMode: isDisplay, delimiter });
        }
      } else if (el.classList.contains('image-wrapper')) {
        const url = el.getAttribute('data-url') || '';
        const alt = el.getAttribute('data-alt') || '';
        const width = parseInt(el.getAttribute('data-width') || '200');
        const height = parseInt(el.getAttribute('data-height') || '150');
        const align = (el.getAttribute('data-align') || 'center') as 'left' | 'center' | 'right';
        segments.push({ type: 'image', url, alt, width, height, aspectRatio: height / width, align });
      } else if (el.tagName === 'BR') {
        segments.push({ type: 'text', content: '\n' });
      } else if (el.tagName === 'P' || el.tagName === 'DIV') {
        // 块级元素前添加换行（如果前面不是换行）
        const lastSeg = segments.length > 0 ? segments[segments.length - 1] : null;
        if (!lastSeg || (lastSeg.type !== 'text' || !lastSeg.content.endsWith('\n'))) {
          segments.push({ type: 'text', content: '\n' });
        }
        // 递归处理子节点
        el.childNodes.forEach((child: Node) => processNodeForAlign(child, segments));
        // 块级元素后添加换行
        segments.push({ type: 'text', content: '\n' });
      } else {
        // 兜底：处理被 contentEditable 解包的原始 <img> 标签
        if (el.tagName === 'IMG') {
          const imgEl = el as HTMLImageElement;
          const url = imgEl.getAttribute('data-url') || imgEl.src || '';
          const alt = imgEl.alt || '';
          const width = parseInt(imgEl.getAttribute('data-width') || String(imgEl.width) || '200');
          const height = parseInt(imgEl.getAttribute('data-height') || String(imgEl.height) || '150');
          const align = (imgEl.getAttribute('data-align') || 'center') as 'left' | 'center' | 'right';
          const cleanUrl = url.replace(/^https?:\/\/[^\/]+\/api\/images\//, '').replace(/^https?:\/\/[^\/]+\//, '');
          segments.push({ type: 'image', url: cleanUrl || url, alt, width, height, aspectRatio: height / width, align });
          return;
        }
        // 递归处理子节点
        el.childNodes.forEach((child: Node) => processNodeForAlign(child, segments));
      }
    }
  };

  // 解析 editor HTML 为 segments - 按 DOM 顺序解析
  const parseEditorHtml = (html: string): Segment[] => {
    const segments: Segment[] = [];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // 遍历所有子节点，按顺序处理
    const processNode = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.trim()) {
          // 检查是否有 LaTeX
          parseTextAndLatex(text, segments);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;

        if (el.classList.contains('latex-source')) {
          // 直接从 data-latex 属性提取 LaTeX 内容
          const storedLatex = el.getAttribute('data-latex') || '';
          const mode = el.getAttribute('data-mode') || 'inline';
          const isDisplay = mode === 'display';
          const storedDelimiter = (el.getAttribute('data-delimiter') || '$') as '$' | '$$';
          // 获取显示的文本内容
          const displayText = el.textContent || '';
          // 判断显示内容是否被用户编辑过（与 data-latex 不一致）
          // 显示内容的格式是 $content$ 或 $$content$$
          const displayTrimmed = displayText.replace(/^\$\$|\$\$$/g, '');
          let latexContent = storedLatex;
          let delimiter: '$' | '$$' = storedDelimiter;

          if (displayTrimmed !== storedLatex) {
            // 用户编辑了 LaTeX 内容，使用显示内容去掉 $ 后的值
            if (displayText.startsWith('$$') && displayText.endsWith('$$')) {
              latexContent = displayText.slice(2, -2);
              delimiter = '$$';
            } else if (displayText.startsWith('$') && displayText.endsWith('$')) {
              latexContent = displayText.slice(1, -1);
              delimiter = '$';
            }
          }

          if (latexContent.trim()) {
            segments.push({ type: 'latex', content: latexContent, displayMode: isDisplay, delimiter });
          }
        } else if (el.classList.contains('image-wrapper')) {
          const url = el.getAttribute('data-url') || '';
          const alt = el.getAttribute('data-alt') || '';
          const width = parseInt(el.getAttribute('data-width') || '200');
          const height = parseInt(el.getAttribute('data-height') || '150');
          const align = (el.getAttribute('data-align') || 'center') as 'left' | 'center' | 'right';
          segments.push({ type: 'image', url, alt, width, height, aspectRatio: height / width, align });
        } else if (el.classList.contains('image-wrapper') && el.querySelector('img')) {
          // 已经在上面处理了
        } else if (el.classList.contains('align-source')) {
          // 对齐块显示为纯文本，提取格式内容
          const content = el.textContent || '';
          const align = (el.getAttribute('data-align') || 'left') as 'left' | 'center' | 'right';
          // 从显示文本中提取原始格式内容（:::align\n内容\n:::）
          const match = content.match(/:::(\w+)\n([\s\S]*?)\n:::/);
          if (match) {
            segments.push({ type: 'align', align: match[1] as 'left' | 'center' | 'right', content: match[2] });
          } else if (content.trim()) {
            // 如果格式被破坏，当作普通文本处理
            parseTextAndLatex(content, segments);
          }
        } else if (el.classList.contains('align-wrapper')) {
          // 对齐块显示为 contenteditable 可视化区域
          const align = (el.getAttribute('data-align') || 'left') as 'left' | 'center' | 'right';
          // 从 innerHTML 提取内容（内部可能有 latex-source、image-wrapper 等）
          const innerDiv = el.querySelector('.align-content');
          if (innerDiv) {
            // 递归处理内部内容
            const innerSegments: Segment[] = [];
            innerDiv.childNodes.forEach((child: Node) => {
              processNodeForAlign(child, innerSegments);
            });
            // 将内部 segments 合并为 markdown 内容
            // 确保内容不为空，否则使用空格
            const innerContent = innerSegments.length > 0
              ? segmentsToMarkdown(innerSegments)
              : ' ';
            segments.push({ type: 'align', align, content: innerContent });
          } else {
            // fallback: 使用 textContent
            const content = el.textContent || '';
            // 去掉标签名
            const cleanContent = content.replace(/^(居左|居中|居右)/, '').trim();
            if (cleanContent) {
              segments.push({ type: 'align', align, content: cleanContent });
            }
          }
        } else if (el.tagName === 'BR') {
          // 换行符处理为空文本
          segments.push({ type: 'text', content: '\n' });
        } else if (el.tagName === 'DIV' || el.tagName === 'P') {
          // 块级元素前加换行（如果没有的话）
          const lastSeg = segments.length > 0 ? segments[segments.length - 1] : null;
          if (lastSeg?.type === 'text' && !lastSeg.content.endsWith('\n')) {
            segments[segments.length - 1] = { ...lastSeg, content: lastSeg.content + '\n' };
          }
          // 递归处理子节点
          el.childNodes.forEach(processNode);
          // 块级元素后加换行
          segments.push({ type: 'text', content: '\n' });
        } else {
          // 兜底：处理被 contentEditable 解包的原始 <img> 标签
          if (el.tagName === 'IMG') {
            const imgEl = el as HTMLImageElement;
            const url = imgEl.getAttribute('data-url') || imgEl.src || '';
            const alt = imgEl.alt || '';
            const width = parseInt(imgEl.getAttribute('data-width') || String(imgEl.width) || '200');
            const height = parseInt(imgEl.getAttribute('data-height') || String(imgEl.height) || '150');
            const align = (imgEl.getAttribute('data-align') || 'center') as 'left' | 'center' | 'right';
            const cleanUrl = url.replace(/^https?:\/\/[^\/]+\/api\/images\//, '').replace(/^https?:\/\/[^\/]+\//, '');
            segments.push({ type: 'image', url: cleanUrl || url, alt, width, height, aspectRatio: height / width, align });
            return;
          }
          // 递归处理其他元素
          el.childNodes.forEach(processNode);
        }
      }
    };

    tempDiv.childNodes.forEach(processNode);
    return segments;
  };

  // 工具栏插入文本
  const handleInsert = useCallback((text: string) => {
    document.execCommand('insertText', false, text);
  }, []);

  // 工具栏插入公式
  const handleLatexInsert = useCallback((latex: string) => {
    document.execCommand('insertText', false, latex);
  }, []);

  // 监听工具栏的图片插入
  useEffect(() => {
    if (!isEditing) return;

    const handleInsertImage = () => {
      const url = prompt('请输入图片 URL 或选择已上传的图片路径（如 images/xxx.png）：');
      if (url) {
        const alt = prompt('请输入图片描述（可选）：') || '';
        document.execCommand('insertText', false, `![${alt}](${url})`);
      }
    };

    document.addEventListener('insert-image', handleInsertImage);
    return () => document.removeEventListener('insert-image', handleInsertImage);
  }, [isEditing]);

  // 鼠标移动 - 处理图片拖动
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current || !editorRef.current) return;

    const { url, startX } = draggingRef.current;
    const aspectRatio = (draggingRef as any).aspectRatio || 0.75;
    const startWidth = draggingRef.current.width;

    const deltaX = e.clientX - startX;
    const newWidth = Math.max(50, Math.min(800, startWidth + deltaX));
    const newHeight = Math.round(newWidth * aspectRatio);

    // 更新 wrapper 尺寸
    const imgWrapper = editorRef.current.querySelector(`[data-url="${url}"]`) as HTMLElement;
    if (imgWrapper) {
      imgWrapper.style.width = `${newWidth}px`;
      imgWrapper.style.height = `${newHeight}px`;
      imgWrapper.setAttribute('data-width', String(newWidth));
      imgWrapper.setAttribute('data-height', String(newHeight));
    }

    setShowResizeHint({ x: e.clientX, y: e.clientY, width: newWidth });
  }, []);

  // 鼠标按下 - 进入编辑模式
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 预览模式下，点击任意位置进入编辑模式
    if (!isEditing) {
      e.preventDefault();
      enterEditMode();
      return;
    }

    const target = e.target as HTMLElement;

    // 检查是否点击了拖动手柄（检查自身或父元素）
    const resizeHandle = target.closest('.resize-handle');
    if (resizeHandle) {
      e.preventDefault();
      e.stopPropagation();

      const wrapper = resizeHandle.closest('.image-wrapper') as HTMLElement;
      if (wrapper) {
        const img = wrapper.querySelector('img') as HTMLImageElement;
        const url = wrapper.getAttribute('data-url') || '';

        // 获取图片当前实际渲染尺寸
        const rect = img.getBoundingClientRect();
        const currentWidth = rect.width;
        const currentHeight = rect.height;

        // 从 segments 获取 aspectRatio（如果图片已加载并有比例）
        const imgSegment = segments.find(s => s.type === 'image' && s.url === url) as Extract<Segment, { type: 'image' }> | undefined;
        let aspectRatio = currentHeight / currentWidth || 0.75;

        // 如果 segments 中有正确的 aspectRatio（不是默认的 0.75），使用它
        if (imgSegment?.aspectRatio && imgSegment.aspectRatio !== 0.75) {
          aspectRatio = imgSegment.aspectRatio;
        }

        // 保存 aspectRatio 到 ref，以便拖动时使用
        (draggingRef as any).aspectRatio = aspectRatio;

        // 使用 ref 同步设置（立即生效）
        draggingRef.current = { url, startX: e.clientX, width: currentWidth, height: currentHeight };
        // 同时更新 state（用于 UI）
        setDraggingImage(url);
        setDragStart({ x: e.clientX, width: currentWidth, height: currentHeight });
        setShowResizeHint({ x: e.clientX, y: e.clientY, width: currentWidth });
      }
      return;
    }

    // 检查是否点击了图片（用于预览大图）
    const clickedImg = target.closest('.image-wrapper img');
    if (clickedImg) {
      setPreviewImage({ src: (clickedImg as HTMLImageElement).src, alt: (clickedImg as HTMLImageElement).alt || '' });
    }
  }, [isEditing, enterEditMode, segments]);

  // 鼠标松开
  const handleMouseUp = useCallback(() => {
    if (draggingRef.current && editorRef.current) {
      const { url } = draggingRef.current;
      // 同步到 segments
      const wrapper = editorRef.current.querySelector(`[data-url="${url}"]`) as HTMLElement;
      if (wrapper) {
        const newWidth = parseInt(wrapper.getAttribute('data-width') || '200');
        const newHeight = parseInt(wrapper.getAttribute('data-height') || '150');

        setSegments(prev => prev.map(seg =>
          seg.type === 'image' && seg.url === url
            ? { ...seg, width: newWidth, height: newHeight }
            : seg
        ));
      }
    }

    draggingRef.current = null;
    setDraggingImage(null);
    setShowResizeHint(null);
  }, []);

  // 全局鼠标事件
  useEffect(() => {
    if (isEditing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isEditing, handleMouseMove, handleMouseUp]);

  // 点击外部离开编辑模式
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      // 如果正在拖动，不处理
      if (draggingRef.current) return;

      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        // 检查是否点击的是工具栏
        const toolbar = document.querySelector('[data-latex-toolbar]');
        if (toolbar?.contains(e.target as Node)) return;

        leaveEditMode();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, leaveEditMode]);

  // 双击图片放大预览
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      setPreviewImage({ src: (target as HTMLImageElement).src, alt: (target as HTMLImageElement).alt || '' });
    }
  }, []);

  return (
    <div className={`border rounded-xl overflow-hidden bg-surface ${className}`}>
      {isEditing ? (
        <>
          <div data-latex-toolbar>
            <LatexToolbar onInsert={handleInsert} onLatexInsert={handleLatexInsert} showImageButton />
          {/* 常用 LaTeX 模板快捷插入 */}
          <div className="border-b px-3 py-1.5 bg-muted/30 flex flex-wrap gap-1 items-center">
            <span className="text-[10px] text-muted-foreground mr-1">模板:</span>
            {[
              { label: '分数', latex: '\\frac{}{}', insert: '\\frac{a}{b}' },
              { label: '根号', latex: '\\sqrt{}', insert: '\\sqrt{x}' },
              { label: '乘号', latex: '\\times', insert: '\\times' },
              { label: '除号', latex: '\\div', insert: '\\div' },
              { label: '下标', latex: '_{}', insert: 'a_{1}' },
              { label: '上标', latex: '^{}', insert: 'x^{2}' },
              { label: '角', latex: '\\angle', insert: '\\angle ABC' },
              { label: '求和', latex: '\\sum', insert: '\\sum_{i=1}^{n}' },
              { label: '约分', latex: '\\cancel', insert: '\\cancel{分子}' },
              { label: '矩阵', latex: '\\begin{matrix}', insert: '\\begin{matrix} a & b \\\\ c & d \\end{matrix}' },
            ].map(tpl => (
              <button
                key={tpl.label}
                type="button"
                className="px-1.5 py-0.5 text-[10px] rounded bg-white border border-border hover:bg-accent/10 transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => handleInsert(tpl.insert)}
                title={tpl.latex}
              >
                \( {tpl.latex} \)
              </button>
            ))}
          </div>
          </div>
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            suppressContentEditableWarning
            className="min-h-[150px] px-4 py-3 focus:outline-none leading-relaxed text-sm bg-white"
            style={{ whiteSpace: 'pre-wrap' }}
            data-placeholder={placeholder}
          />
          <div className="border-t px-4 py-2 bg-muted/50 text-xs text-muted-foreground">
            编辑模式：图片拖动右下角调整尺寸，工具栏插入内容
          </div>
        </>
      ) : (
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          className="min-h-[100px] px-4 py-3 cursor-text leading-relaxed bg-white"
        >
          {segments.length === 0 ? (
            <span className="text-gray-400 text-sm">{placeholder}</span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html: renderPreviewHtml(segments, baseUrl) }} />
          )}
        </div>
      )}

      {/* 拖动尺寸提示 */}
      {showResizeHint && (
        <div
          className="fixed bg-black/80 text-white text-xs px-2 py-1 rounded pointer-events-none z-50"
          style={{ left: showResizeHint.x + 10, top: showResizeHint.y - 30 }}
        >
          {showResizeHint.width}px
        </div>
      )}

      {/* 图片预览模态框 */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-full p-4">
            <button
              className="absolute top-2 right-2 text-white text-2xl font-bold hover:text-gray-300 bg-black/50 rounded-full w-10 h-10 flex items-center justify-center"
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
            <img
              src={previewImage.src}
              alt={previewImage.alt}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
