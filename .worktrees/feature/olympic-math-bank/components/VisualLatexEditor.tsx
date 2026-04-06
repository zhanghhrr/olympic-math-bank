'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import katex from 'katex';
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

// 渲染单个 LaTeX 公式
function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), { displayMode, throwOnError: false });
  } catch {
    return displayMode ? `$$${latex}$$` : `$${latex}$`;
  }
}

// 渲染文本中的 LaTeX 公式
function renderLatexInText(text: string): string {
  if (!text) return text;

  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => renderLatex(latex, true));
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => renderLatex(latex, true));
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => renderLatex(latex, false));
  text = text.replace(/\$([^$\n]+?)\$/g, (_, latex) => renderLatex(latex, false));

  return text;
}

// 解析 markdown 图片语法
interface ImageData {
  match: string;
  alt: string;
  url: string;
  width: number;
  height: number;
  aspectRatio: number;
}

function parseImages(text: string): ImageData[] {
  const images: ImageData[] = [];
  const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const w = m[3] ? parseInt(m[3]) : 200;
    const h = m[4] ? parseInt(m[4]) : 150;
    images.push({
      match: m[0],
      alt: m[1],
      url: m[2],
      width: w,
      height: h,
      aspectRatio: h / w,
    });
  }
  return images;
}

// 将 markdown 内容转换为 HTML
function markdownToHtml(text: string, baseUrl: string): string {
  if (!text) return '';

  const images = parseImages(text);
  if (images.length === 0) {
    return renderLatexInText(text);
  }

  let html = '';
  let lastIndex = 0;

  images.forEach((img) => {
    const pos = text.indexOf(img.match, lastIndex);

    if (pos > lastIndex) {
      html += renderLatexInText(text.substring(lastIndex, pos));
    }

    const imgUrl = getImageUrl(img.url, baseUrl);
    html += `<img src="${imgUrl}" alt="${img.alt}" data-width="${img.width}" data-height="${img.height}" data-orig-width="${img.width}" data-orig-height="${img.height}" class="resizable-image" style="width:${img.width}px;height:${img.height}px;display:inline-block;vertical-align:middle;margin:0 4px;border:1px solid #e5e7eb;border-radius:4px;cursor:ew-resize;" />`;

    lastIndex = pos + img.match.length;
  });

  if (lastIndex < text.length) {
    html += renderLatexInText(text.substring(lastIndex));
  }

  return html;
}

// 将 HTML 转回 markdown
function htmlToMarkdown(html: string): string {
  let text = html;

  text = text.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match) => {
    const srcMatch = match.match(/src=["']([^"']+)["']/);
    const altMatch = match.match(/alt=["']([^"']+)["']/);
    const widthMatch = match.match(/data-width=["']([^"']+)["']/);
    const heightMatch = match.match(/data-height=["']([^"']+)["']/);

    if (!srcMatch) return '';

    const src = srcMatch[1];
    const alt = altMatch ? altMatch[1] : '';
    const w = widthMatch ? widthMatch[1] : '';
    const h = heightMatch ? heightMatch[1] : '';

    let cleanUrl = src;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
    if (src.startsWith(baseUrl)) {
      cleanUrl = src.substring(baseUrl.length);
      if (cleanUrl.startsWith('/api/images/')) {
        cleanUrl = cleanUrl.substring('/api/images/'.length);
      }
    }

    if (w && h) {
      return `![${alt}](${cleanUrl} =${w}x${h}=)`;
    }
    return `![${alt}](${cleanUrl})`;
  });

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
  const editorRef = useRef<HTMLDivElement>(null);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';

  // 拖动状态
  const dragRef = useRef<{
    active: boolean;
    target: HTMLImageElement | null;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    aspectRatio: number;
  }>({ active: false, target: null, startX: 0, startY: 0, startWidth: 0, startHeight: 0, aspectRatio: 1 });

  // 初始化编辑器内容
  useEffect(() => {
    if (isEditing && editorRef.current) {
      const html = markdownToHtml(value, baseUrl);
      if (editorRef.current.innerHTML !== html) {
        editorRef.current.innerHTML = html;
      }
    }
  }, [isEditing, value, baseUrl]);

  // 处理内容变化
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const markdown = htmlToMarkdown(html);
    onChange(markdown);
  }, [onChange]);

  // 鼠标按下 - 检测是否点击图片右下角调整区域
  const handleEditorMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 如果点击的是图片
    if (target.tagName === 'IMG' && target.classList.contains('resizable-image')) {
      const rect = target.getBoundingClientRect();
      const img = target as HTMLImageElement;

      // 检测是否点击右下角 25x25 区域
      const inCorner = (
        e.clientX >= rect.right - 25 &&
        e.clientY >= rect.bottom - 25 &&
        e.clientX <= rect.right &&
        e.clientY <= rect.bottom
      );

      if (inCorner) {
        e.preventDefault();
        e.stopPropagation();

        const width = parseInt(img.getAttribute('data-width') || '200');
        const height = parseInt(img.getAttribute('data-height') || '150');
        const aspectRatio = height / width;

        dragRef.current = {
          active: true,
          target: img,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: width,
          startHeight: height,
          aspectRatio,
        };

        img.style.opacity = '0.8';
        return;
      }
    }

    // 其他情况进入编辑模式
    if (!isEditing) {
      setIsEditing(true);
    }
  }, [isEditing]);

  // 鼠标移动
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current.active || !dragRef.current.target) return;

    e.preventDefault();

    const deltaX = e.clientX - dragRef.current.startX;
    const newWidth = Math.max(50, Math.min(800, dragRef.current.startWidth + deltaX));
    const newHeight = Math.round(newWidth * dragRef.current.aspectRatio);

    const img = dragRef.current.target;
    img.style.width = `${newWidth}px`;
    img.style.height = `${newHeight}px`;
    img.setAttribute('data-width', String(newWidth));
    img.setAttribute('data-height', String(newHeight));
  }, []);

  // 鼠标松开
  const handleMouseUp = useCallback(() => {
    if (dragRef.current.active && dragRef.current.target) {
      const img = dragRef.current.target;
      img.style.opacity = '1';

      // 保存变化
      const html = editorRef.current?.innerHTML || '';
      const markdown = htmlToMarkdown(html);
      onChange(markdown);
    }

    dragRef.current = { active: false, target: null, startX: 0, startY: 0, startWidth: 0, startHeight: 0, aspectRatio: 1 };
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
    const html = renderLatexInText(latex);
    document.execCommand('insertHTML', false, html);
    handleInput();
  }, [handleInput]);

  // 离开编辑模式
  const leaveEditMode = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const markdown = htmlToMarkdown(html);
      onChange(markdown);
    }
    setIsEditing(false);
  }, [onChange]);

  // 预览模式渲染
  const renderPreview = () => {
    if (!value) {
      return <span className="text-gray-400 text-sm">{placeholder}</span>;
    }

    const images = parseImages(value);
    if (images.length === 0) {
      const html = renderLatexInText(value);
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    images.forEach((img, idx) => {
      const pos = value.indexOf(img.match, lastIndex);

      if (pos > lastIndex) {
        const text = value.substring(lastIndex, pos);
        const html = renderLatexInText(text);
        parts.push(<span key={`t${idx}`} dangerouslySetInnerHTML={{ __html: html }} />);
      }

      const imgUrl = getImageUrl(img.url, baseUrl);
      parts.push(
        <span key={`i${idx}`} className="relative inline-block">
          <img
            src={imgUrl}
            alt={img.alt}
            width={img.width}
            height={img.height}
            style={{ width: img.width, height: img.height }}
            className="inline-block align-middle mx-1 border border-gray-200 rounded"
          />
        </span>
      );

      lastIndex = pos + img.match.length;
    });

    if (lastIndex < value.length) {
      const text = value.substring(lastIndex);
      const html = renderLatexInText(text);
      parts.push(<span key="end" dangerouslySetInnerHTML={{ __html: html }} />);
    }

    return <>{parts}</>;
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
            onMouseDown={handleEditorMouseDown}
            className="min-h-[150px] px-3 py-2 focus:outline-none leading-relaxed"
            style={{ whiteSpace: 'pre-wrap' }}
          />
          <div className="border-t px-3 py-2 bg-gray-50 text-xs text-gray-500">
            输入 ![alt](url) 插入图片，拖动图片右下角调整大小
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
    </div>
  );
}
