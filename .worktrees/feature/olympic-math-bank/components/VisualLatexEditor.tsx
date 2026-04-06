'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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

// 解析 markdown 图片语法，提取尺寸信息
interface ImageInfo {
  fullMatch: string;
  alt: string;
  url: string;
  width?: number;
  height?: number;
}

function parseImages(text: string): ImageInfo[] {
  const images: ImageInfo[] = [];
  // 匹配：![alt](url =WxH=) 或 ![alt](url)
  const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    images.push({
      fullMatch: match[0],
      alt: match[1],
      url: match[2],
      width: match[3] ? parseInt(match[3]) : undefined,
      height: match[4] ? parseInt(match[4]) : undefined,
    });
  }
  return images;
}

// 可调整尺寸的图片组件
interface InlineResizableImageProps {
  src: string;
  alt: string;
  width: number;
  height?: number;
  isSelected: boolean;
  onSelect: () => void;
  onResize: (newWidth: number, newHeight?: number) => void;
}

function InlineResizableImage({
  src,
  alt,
  width,
  height,
  isSelected,
  onSelect,
  onResize,
}: InlineResizableImageProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(width);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const aspectRatio = height && width ? height / width : 0.75;

  // 同步外部宽度变化
  useEffect(() => {
    setCurrentWidth(width);
  }, [width]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
    onSelect();
  }, [currentWidth, onSelect]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(50, Math.min(800, startWidthRef.current + delta));
      setCurrentWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (currentWidth !== startWidthRef.current) {
        onResize(currentWidth);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, currentWidth, onResize]);

  const displayHeight = Math.round(currentWidth * aspectRatio);

  return (
    <span
      className={`relative inline-block align-middle mx-1 group ${isSelected ? 'ring-2 ring-blue-500 rounded' : ''}`}
      style={{ width: currentWidth, height: displayHeight }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain rounded"
        draggable={false}
      />
      {/* 左侧拖动手柄 - 始终显示 */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-5 cursor-ew-resize flex items-center justify-center rounded-l transition-colors ${
          isDragging
            ? 'bg-blue-400'
            : 'bg-gray-200/80 hover:bg-blue-300 opacity-0 group-hover:opacity-100'
        }`}
        style={{ top: '50%', transform: 'translateY(-50%)', height: '24px', marginTop: 0 }}
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="w-3 h-3 text-gray-600" />
      </span>
      {/* 宽度提示 */}
      {isDragging && (
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
          {currentWidth}px
        </span>
      )}
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
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { getImageUrl } = useImageUrl();

  // 解析图片
  const images = useMemo(() => parseImages(value), [value]);

  // 处理图片尺寸调整
  const handleImageResize = useCallback((index: number, newWidth: number) => {
    const img = images[index];
    if (!img) return;

    const aspectRatio = img.height && img.width ? img.height / img.width : 0.75;
    const newHeight = Math.round(newWidth * aspectRatio);

    // 更新 markdown 语法中的尺寸
    const newImageMarkdown = `![${img.alt}](${img.url} =${newWidth}x${newHeight}=)`;
    const newValue = value.replace(img.fullMatch, newImageMarkdown);
    onChange(newValue);
  }, [images, value, onChange]);

  // 处理工具栏插入
  const handleInsert = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + text + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + text.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [value, onChange]);

  // 切换到编辑模式
  const handleFocus = () => {
    setIsEditing(true);
    setSelectedImageIndex(null);
  };

  // 失焦时切换到预览模式
  const handleBlur = () => {
    setTimeout(() => {
      if (containerRef.current?.contains(document.activeElement)) {
        return;
      }
      setIsEditing(false);
      setSelectedImageIndex(null);
    }, 150);
  };

  // 预览模式：混合渲染文本和图片
  const renderPreview = () => {
    if (!value) {
      return <span className="text-gray-400 text-sm">{placeholder}</span>;
    }

    const parts: React.ReactNode[] = [];
    const images = parseImages(value);

    if (images.length === 0) {
      // 没有图片，只渲染文本
      const htmlContent = renderLatexToHtml(value);
      return <span dangerouslySetInnerHTML={{ __html: htmlContent }} className="question-text" />;
    }

    // 分割文本，插入图片
    let lastIndex = 0;
    const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g;

    images.forEach((img, idx) => {
      const match = value.indexOf(img.fullMatch, lastIndex);
      if (match > lastIndex) {
        const textBefore = value.substring(lastIndex, match);
        const htmlBefore = renderLatexToHtml(textBefore);
        parts.push(
          <span key={`text-${idx}`} dangerouslySetInnerHTML={{ __html: htmlBefore }} className="question-text" />
        );
      }

      // 图片
      const imgWidth = img.width || 200;
      const imgHeight = img.height;
      const aspectRatio = imgHeight && imgWidth ? imgHeight / imgWidth : 0.75;
      const displayHeight = Math.round(imgWidth * aspectRatio);

      parts.push(
        <InlineResizableImage
          key={`img-${idx}`}
          src={getImageUrl(img.url)}
          alt={img.alt}
          width={imgWidth}
          height={imgHeight}
          isSelected={selectedImageIndex === idx}
          onSelect={() => {
            setSelectedImageIndex(idx);
            setIsEditing(true);
          }}
          onResize={(newWidth) => handleImageResize(idx, newWidth)}
        />
      );

      lastIndex = match + img.fullMatch.length;
    });

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
    <div ref={containerRef} className={`border rounded-lg overflow-hidden ${className}`}>
      {isEditing ? (
        <>
          <LatexToolbar onInsert={handleInsert} />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            rows={rows}
            className="w-full px-3 py-2 border-0 focus:outline-none focus:ring-0 resize-y font-mono text-sm"
            placeholder={placeholder}
          />
          <div className="border-t px-3 py-2 bg-gray-50 text-xs text-gray-500">
            点击图片选中，拖动左侧手柄调整大小
          </div>
        </>
      ) : (
        <div
          onClick={() => {
            setIsEditing(true);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
          className="min-h-[100px] px-3 py-2 cursor-text"
        >
          {renderPreview()}
        </div>
      )}
    </div>
  );
}
