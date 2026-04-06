'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import katex from 'katex';
import { GripVertical } from 'lucide-react';
import { LatexToolbar } from './LatexToolbar';
import { useImageUrl } from '@/hooks/useImageUrl';

// 渲染 LaTeX 到 HTML
function renderLatexToHtml(text: string): string {
  if (!text) return text;

  // 块级公式：$$...$$
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `$$${latex}$$`;
    }
  });

  // 块级公式：\[...\]
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `\\[${latex}\\]`;
    }
  });

  // 行内公式：\(...\)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `\\(${latex}\\)`;
    }
  });

  // 行内公式：$...$
  text = text.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `$${latex}$`;
    }
  });

  return text;
}

// 解析 HTML 内容中的图片，提取尺寸信息
function parseImagesFromHtml(html: string): { url: string; width: number; height: number }[] {
  const images: { url: string; width: number; height: number }[] = [];
  const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const srcMatch = match[0].match(/src=["']([^"']+)["']/);
    const widthMatch = match[0].match(/data-width=["']([^"']+)["']/);
    const heightMatch = match[0].match(/data-height=["']([^"']+)["']/);
    if (srcMatch) {
      images.push({
        url: srcMatch[1],
        width: widthMatch ? parseInt(widthMatch[1]) : 200,
        height: heightMatch ? parseInt(heightMatch[1]) : 150,
      });
    }
  }
  return images;
}

// 可拖动调整尺寸的图片组件
interface ResizableImageProps {
  src: string;
  alt?: string;
  initialWidth?: number;
  initialHeight?: number;
  onResize: (width: number, height: number) => void;
}

function ResizableImage({ src, alt = '', initialWidth = 200, initialHeight = 150, onResize }: ResizableImageProps) {
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const aspectRatio = initialHeight / initialWidth;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(50, Math.min(800, startWidthRef.current + delta));
      setWidth(newWidth);
      setHeight(Math.round(newWidth * aspectRatio));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onResize(width, height);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, width, height, aspectRatio, onResize]);

  return (
    <span
      className="relative inline-block align-middle"
      style={{ width, height }}
      contentEditable={false}
      data-image-src={src}
      data-width={width}
      data-height={height}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain border border-gray-300 rounded"
        draggable={false}
      />
      {/* 左侧拖动手柄 */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-5 cursor-ew-resize flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-l border-r border-gray-300 ${
          isDragging ? 'bg-blue-200 border-blue-400' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="w-3 h-3 text-gray-500" />
      </span>
      {/* 宽度提示 */}
      <span
        className={`absolute -bottom-5 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-1 rounded ${
          isDragging ? 'opacity-100' : 'opacity-0'
        } transition-opacity`}
      >
        {width}px
      </span>
    </span>
  );
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
  const { getImageUrl } = useImageUrl();

  // 初始化编辑器内容
  useEffect(() => {
    if (editorRef.current && isEditing) {
      // 解析内容，将 markdown 图片转换为可编辑的 HTML
      const html = parseContentToHtml(value, getImageUrl);
      if (editorRef.current.innerHTML !== html) {
        editorRef.current.innerHTML = html;
      }
    }
  }, [isEditing, value, getImageUrl]);

  // 将 markdown 内容转换为 HTML
  const parseContentToHtml = (content: string, getImageUrlFn: (path: string) => string): string => {
    if (!content) return '';

    // 先渲染 LaTeX
    let html = renderLatexToHtml(content);

    // 替换图片语法为 HTML img 标签
    // 格式：![alt](url =WxH=) 或 ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g, (_, alt, url, w, h) => {
      const width = w || 200;
      const height = h ? `data-height="${h}"` : '';
      return `<img src="${getImageUrlFn(url)}" alt="${alt}" data-width="${width}" ${height} style="width:${width}px;height:auto;" />`;
    });

    return html;
  };

  // 处理图片尺寸变化
  const handleImageResize = useCallback((imgElement: HTMLImageElement, newWidth: number, newHeight: number) => {
    imgElement.setAttribute('data-width', String(newWidth));
    imgElement.setAttribute('data-height', String(newHeight));
    imgElement.style.width = `${newWidth}px`;
    imgElement.style.height = 'auto';

    // 通知内容变化
    triggerChange();
  }, []);

  // 触发内容变化
  const triggerChange = useCallback(() => {
    if (!editorRef.current) return;

    // 将 HTML 内容转回 markdown 格式
    const html = editorRef.current.innerHTML;
    const markdown = htmlToMarkdown(html);
    onChange(markdown);
  }, [onChange]);

  // 将 HTML 转回带尺寸信息的 markdown
  const htmlToMarkdown = (html: string): string => {
    // 替换 img 标签为带尺寸的 markdown 图片语法
    return html.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match) => {
      const srcMatch = match.match(/src=["']([^"']+)["']/);
      const altMatch = match.match(/alt=["']([^"']+)["']/);
      const widthMatch = match.match(/data-width=["']([^"']+)["']/);
      const heightMatch = match.match(/data-height=["']([^"']+)["']/);

      if (!srcMatch) return match;

      const url = srcMatch[1];
      const alt = altMatch ? altMatch[1] : '';
      const width = widthMatch ? widthMatch[1] : '';
      const height = heightMatch ? heightMatch[1] : '';

      // 移除 API 前缀获取原始路径
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
      let cleanUrl = url;
      if (url.startsWith(baseUrl)) {
        cleanUrl = url.substring(baseUrl.length);
        if (cleanUrl.startsWith('/api/images/')) {
          cleanUrl = cleanUrl.substring('/api/images/'.length);
        }
      }

      if (width && height) {
        return `![${alt}](${cleanUrl} =${width}x${height}=)`;
      }
      return `![${alt}](${cleanUrl})`;
    });
  };

  // 处理工具栏插入
  const handleInsert = useCallback((text: string) => {
    if (!editorRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // 如果没有选区，在末尾插入
      editorRef.current.innerHTML += text;
    } else {
      // 在选区位置插入
      const range = selection.getRangeAt(0);
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);

      // 移动光标到插入内容之后
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    triggerChange();
  }, [triggerChange]);

  // 处理粘贴
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // 点击进入编辑模式
  const handleClick = useCallback(() => {
    if (!isEditing) {
      setIsEditing(true);
    }
  }, [isEditing]);

  // 失焦时保存内容
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (editorRef.current && document.activeElement !== editorRef.current) {
        // 确保内容已保存
        triggerChange();
        setIsEditing(false);
      }
    }, 200);
  }, [triggerChange]);

  // 预览模式渲染
  const renderPreview = () => {
    if (!value) {
      return <span className="text-gray-400 text-sm">{placeholder}</span>;
    }

    // 解析 markdown 内容
    const parts: React.ReactNode[] = [];
    const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g;
    let lastIndex = 0;
    let match;

    const htmlContent = renderLatexToHtml(value);

    while ((match = regex.exec(value)) !== null) {
      // 文本部分
      if (match.index > lastIndex) {
        const textBefore = value.substring(lastIndex, match.index);
        const htmlBefore = renderLatexToHtml(textBefore);
        parts.push(
          <span key={`text-${lastIndex}`} dangerouslySetInnerHTML={{ __html: htmlBefore }} className="question-text" />
        );
      }

      // 图片部分
      const alt = match[1];
      const url = match[2];
      const width = match[3] ? parseInt(match[3]) : 200;
      const height = match[4] ? parseInt(match[4]) : undefined;

      parts.push(
        <img
          key={`img-${match.index}`}
          src={getImageUrl(url)}
          alt={alt}
          width={width}
          height={height}
          style={width ? { width, height: height || 'auto' } : undefined}
          className="inline-block max-w-full h-auto align-middle mx-1 border border-gray-200 rounded"
        />
      );

      lastIndex = match.index + match[0].length;
    }

    // 剩余文本
    if (lastIndex < value.length) {
      const remaining = value.substring(lastIndex);
      const htmlRemaining = renderLatexToHtml(remaining);
      parts.push(
        <span key="text-end" dangerouslySetInnerHTML={{ __html: htmlRemaining }} className="question-text" />
      );
    }

    return <>{parts}</>;
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      {isEditing ? (
        <>
          <LatexToolbar onInsert={handleInsert} />
          <div
            ref={editorRef}
            contentEditable
            onBlur={handleBlur}
            onPaste={handlePaste}
            onInput={triggerChange}
            className="min-h-[100px] px-3 py-2 focus:outline-none prose prose-sm max-w-none"
            style={{ whiteSpace: 'pre-wrap' }}
            spellCheck={false}
          />
          <div className="border-t px-3 py-2 bg-gray-50 text-xs text-gray-500">
            提示：拖动图片左侧手柄可调整大小
          </div>
        </>
      ) : (
        <div
          onClick={handleClick}
          className="min-h-[100px] px-3 py-2 cursor-text"
        >
          {renderPreview()}
        </div>
      )}
    </div>
  );
}
