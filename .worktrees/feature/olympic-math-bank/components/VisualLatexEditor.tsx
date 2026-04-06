'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import katex from 'katex';
import { GripHorizontal } from 'lucide-react';
import { LatexToolbar } from './LatexToolbar';

// 获取图片完整 URL
function getImageUrl(path: string, baseUrl: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('images/')) {
    return `${baseUrl}/api/images/${path}`;
  }
  return `${baseUrl}/${path}`;
}

// 解析 markdown 图片语法
interface ImageData {
  match: string;
  alt: string;
  url: string;
  width: number;
  height: number;
  aspectRatio: number;
  hasSize: boolean;
}

function parseImages(text: string): ImageData[] {
  const images: ImageData[] = [];
  const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const w = m[3] ? parseInt(m[3]) : 0;
    const h = m[4] ? parseInt(m[4]) : 0;
    images.push({
      match: m[0],
      alt: m[1],
      url: m[2],
      width: w || 200,
      height: h || 150,
      aspectRatio: h && w ? h / w : 0.75,
      hasSize: !!(w && h),
    });
  }
  return images;
}

// 渲染单个 LaTeX 公式为 HTML
function renderLatexToHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), { displayMode, throwOnError: false });
  } catch {
    return displayMode ? `$$${latex}$$` : `$${latex}$`;
  }
}

// 将 markdown 内容转换为预览 HTML
function markdownToPreviewHtml(text: string, baseUrl: string): string {
  if (!text) return '';

  let result = text;

  // 先处理图片
  const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g;
  result = result.replace(imageRegex, (match, alt, url, w, h) => {
    const imgUrl = getImageUrl(url, baseUrl);
    const width = w || 200;
    const height = h || Math.round(width * 0.75);
    return `<img src="${imgUrl}" alt="${alt}" data-url="${url}" data-width="${width}" data-height="${height}" data-original="${match}" data-has-size="${!!(w && h)}" class="preview-image" style="width:${width}px;height:${height}px;display:inline;vertical-align:middle;margin:4px;border:1px solid #e5e7eb;border-radius:4px;" />`;
  });

  // 处理 LaTeX 公式
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => renderLatexToHtml(latex, true));
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => renderLatexToHtml(latex, true));
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => renderLatexToHtml(latex, false));
  result = result.replace(/\$([^$\n]+?)\$/g, (_, latex) => renderLatexToHtml(latex, false));

  return result;
}

// 将 markdown 内容转换为编辑 HTML
function markdownToEditHtml(text: string, baseUrl: string): string {
  if (!text) return '';

  let result = text;

  // 先处理图片
  const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g;
  result = result.replace(imageRegex, (match, alt, url, w, h) => {
    const imgUrl = getImageUrl(url, baseUrl);
    const width = w || 200;
    const height = h || Math.round(width * 0.75);
    const sizeStyle = w && h ? `width:${width}px;height:${height}px;` : 'max-width:300px;height:auto;';
    return `<img src="${imgUrl}" alt="${alt}" data-url="${url}" data-width="${width}" data-height="${height}" data-original="${match}" data-has-size="${!!(w && h)}" class="edit-image" style="${sizeStyle}display:inline;vertical-align:middle;margin:4px;border:1px solid #e5e7eb;border-radius:4px;cursor:se-resize;" />`;
  });

  // 处理 LaTeX 公式 - 显示源码
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    return `<span class="latex-source" data-latex="$$${latex}$$" style="font-family:monospace;background:#f3f4f6;padding:0 4px;border-radius:2px;color:#7c3aed;">$$${latex}$$</span>`;
  });
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => {
    return `<span class="latex-source" data-latex="\\[${latex}\\]" style="font-family:monospace;background:#f3f4f6;padding:0 4px;border-radius:2px;color:#7c3aed;">\\[${latex}\\]</span>`;
  });
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => {
    return `<span class="latex-source" data-latex="\\(${latex}\\)" style="font-family:monospace;background:#f3f4f6;padding:0 4px;border-radius:2px;color:#7c3aed;">\\(${latex}\\)</span>`;
  });
  result = result.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
    return `<span class="latex-source" data-latex="$${latex}$" style="font-family:monospace;background:#f3f4f6;padding:0 4px;border-radius:2px;color:#7c3aed;">$${latex}$</span>`;
  });

  return result;
}

// 将 HTML 转回 markdown
function htmlToMarkdown(html: string): string {
  let text = html;

  // 提取图片信息
  text = text.replace(/<img[^>]+class="(?:preview-image|edit-image)"[^>]*>/gi, (match) => {
    const urlMatch = match.match(/data-url="([^"]+)"/);
    const widthMatch = match.match(/data-width="([^"]+)"/);
    const heightMatch = match.match(/data-height="([^"]+)"/);
    const altMatch = match.match(/alt="([^"]+)"/);
    const hasSizeMatch = match.match(/data-has-size="([^"]+)"/);

    if (!urlMatch) return '';

    const alt = altMatch ? altMatch[1] : '';
    const hasSize = hasSizeMatch && hasSizeMatch[1] === 'true';

    if (hasSize && widthMatch && heightMatch) {
      return `![${alt}](${urlMatch[1]} =${widthMatch[1]}x${heightMatch[1]}=)`;
    }
    return `![${alt}](${urlMatch[1]})`;
  });

  // 提取 LaTeX 源码
  text = text.replace(/<span class="latex-source"[^>]*data-latex="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi, (_, latex) => {
    return latex;
  });

  // 清理其他标签
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');

  return text;
}

interface VisualLatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function VisualLatexEditor({
  value,
  onChange,
  placeholder = '请输入内容...',
  rows = 6,
  className = '',
}: VisualLatexEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [showResizeHint, setShowResizeHint] = useState<{ x: number; y: number; width: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';

  // 拖动状态
  const dragRef = useRef<{
    active: boolean;
    target: HTMLImageElement | null;
    startX: number;
    startWidth: number;
    aspectRatio: number;
  }>({ active: false, target: null, startX: 0, startWidth: 0, aspectRatio: 1 });

  // 初始化编辑器内容
  useEffect(() => {
    if (isEditing && editorRef.current) {
      const editHtml = markdownToEditHtml(value, baseUrl);
      if (editorRef.current.innerHTML !== editHtml) {
        editorRef.current.innerHTML = editHtml;
      }
    }
  }, [isEditing, value, baseUrl]);

  // 处理输入
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const markdown = htmlToMarkdown(html);
    onChange(markdown);
  }, [onChange]);

  // 鼠标移动 - 用于拖动和显示提示
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // 如果正在拖动
    if (dragRef.current.active && dragRef.current.target) {
      e.preventDefault();

      const deltaX = e.clientX - dragRef.current.startX;
      const newWidth = Math.max(50, Math.min(800, dragRef.current.startWidth + deltaX));
      const newHeight = Math.round(newWidth * dragRef.current.aspectRatio);

      const img = dragRef.current.target;
      img.style.width = `${newWidth}px`;
      img.style.height = `${newHeight}px`;
      img.setAttribute('data-width', String(newWidth));
      img.setAttribute('data-height', String(newHeight));

      setShowResizeHint({ x: e.clientX, y: e.clientY, width: newWidth });
      return;
    }

    // 显示拖动提示
    if (isEditing && target.tagName === 'IMG') {
      const rect = target.getBoundingClientRect();
      const inCorner = (
        e.clientX >= rect.right - 30 &&
        e.clientY >= rect.bottom - 30 &&
        e.clientX <= rect.right + 5 &&
        e.clientY <= rect.bottom + 5
      );

      if (inCorner) {
        setShowResizeHint({ x: e.clientX, y: e.clientY, width: parseInt(target.getAttribute('data-width') || '200') });
      } else {
        setShowResizeHint(null);
      }
    } else {
      setShowResizeHint(null);
    }
  }, [isEditing]);

  // 鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 检查是否点击图片右下角
    if (target.tagName === 'IMG') {
      const rect = target.getBoundingClientRect();
      const inCorner = (
        e.clientX >= rect.right - 30 &&
        e.clientY >= rect.bottom - 30 &&
        e.clientX <= rect.right + 5 &&
        e.clientY <= rect.bottom + 5
      );

      if (inCorner) {
        e.preventDefault();
        e.stopPropagation();

        const width = parseInt(target.getAttribute('data-width') || '200');
        const height = parseInt(target.getAttribute('data-height') || '150');
        const aspectRatio = height / width;

        dragRef.current = {
          active: true,
          target: target,
          startX: e.clientX,
          startWidth: width,
          aspectRatio,
        };

        setShowResizeHint({ x: e.clientX, y: e.clientY, width });
        return;
      }
    }

    // 检查是否点击 LaTeX 源码
    if (target.classList.contains('latex-source')) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }

    if (!isEditing) {
      setIsEditing(true);
    }
  }, [isEditing]);

  // 鼠标松开
  const handleMouseUp = useCallback(() => {
    if (dragRef.current.active) {
      const img = dragRef.current.target;
      if (img) {
        // 更新 data-has-size 为 true
        img.setAttribute('data-has-size', 'true');
        const html = editorRef.current?.innerHTML || '';
        const markdown = htmlToMarkdown(html);
        onChange(markdown);
      }
    }

    dragRef.current = { active: false, target: null, startX: 0, startWidth: 0, aspectRatio: 1 };
    setShowResizeHint(null);
  }, [onChange]);

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

  // 粘贴处理
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // 工具栏插入
  const handleInsert = useCallback((text: string) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, text);
    handleInput();
  }, [handleInput]);

  const handleLatexInsert = useCallback((latex: string) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, latex);
    handleInput();
  }, [handleInput]);

  // 离开编辑模式
  const leaveEditMode = useCallback(() => {
    setTimeout(() => {
      if (!editorRef.current?.contains(document.activeElement)) {
        const html = editorRef.current?.innerHTML || '';
        const markdown = htmlToMarkdown(html);
        onChange(markdown);
        setIsEditing(false);
      }
    }, 100);
  }, [onChange]);

  // 双击预览
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      e.preventDefault();
      e.stopPropagation();
      setPreviewImage({ src: target.src, alt: target.alt || '' });
    }
  }, []);

  // 预览模式渲染
  const renderPreview = () => {
    if (!value) {
      return <span className="text-gray-400 text-sm">{placeholder}</span>;
    }
    const html = markdownToPreviewHtml(value, baseUrl);
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      {isEditing ? (
        <>
          <LatexToolbar onInsert={handleInsert} onLatexInsert={handleLatexInsert} />
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onPaste={handlePaste}
            onBlur={leaveEditMode}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            className="min-h-[150px] px-3 py-2 focus:outline-none leading-relaxed text-sm"
            style={{ whiteSpace: 'pre-wrap' }}
          />
          <div className="border-t px-3 py-2 bg-gray-50 text-xs text-gray-500">
            编辑模式：图片拖动右下角调整大小，公式显示源码，双击图片预览
          </div>
        </>
      ) : (
        <div
          onClick={() => setIsEditing(true)}
          className="min-h-[100px] px-3 py-2 cursor-text leading-relaxed"
        >
          {renderPreview()}
        </div>
      )}
      {/* 拖动尺寸提示 */}
      {showResizeHint && (
        <div
          className="fixed bg-black/80 text-white text-xs px-2 py-1 rounded pointer-events-none z-50"
          style={{
            left: showResizeHint.x + 10,
            top: showResizeHint.y - 30,
          }}
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
