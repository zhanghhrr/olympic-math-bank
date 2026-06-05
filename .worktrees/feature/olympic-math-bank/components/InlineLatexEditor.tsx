'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import katex from 'katex';
import { GripVertical } from 'lucide-react';
import { LatexToolbar } from './LatexToolbar';
import { useImageUrl } from '@/hooks/useImageUrl';

// 图片尺寸解析 - 支持语法：![](url =WxH=) 或 ![](url "width x height")
function parseInlineImages(text: string): Array<{
  before: string;
  imageMarkdown: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
  fullMatch: string;
}> {
  const results: Array<{
    before: string;
    imageMarkdown: string;
    url: string;
    alt: string;
    width?: number;
    height?: number;
    fullMatch: string;
  }> = [];

  // 匹配格式：![](url =WxH=) 或 ![](url "width x height")
  // 使用非贪婪匹配和回溯来正确解析
  const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:=([0-9]+)x([0-9]+)=|"([^"]+)")?)?\)/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 获取本次匹配之前的文本
    const before = text.substring(lastIndex, match.index);

    const alt = match[1];
    const url = match[2];
    let width: number | undefined;
    let height: number | undefined;

    // 解析 =WxH= 格式
    if (match[3] && match[4]) {
      width = parseInt(match[3], 10);
      height = parseInt(match[4], 10);
    }
    // 解析 "width x height" 格式
    else if (match[5]) {
      const parts = match[5].split('x');
      if (parts.length === 2) {
        width = parseInt(parts[0].trim(), 10);
        height = parseInt(parts[1].trim(), 10);
      }
    }

    results.push({
      before,
      imageMarkdown: match[0],
      url,
      alt,
      width,
      height,
      fullMatch: match[0],
    });

    lastIndex = match.index + match[0].length;
  }

  return results;
}

// 渲染 LaTeX 到 HTML
function renderLatexToHtml(text: string): string {
  if (!text) return text;

  // 行内公式：$$...$$
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
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

  // 将换行符转为 <br>，确保行内公式之间的换行不被 HTML 空白折叠
  return text.replace(/\n/g, '<br>');
}

interface InlineImageProps {
  src: string;
  alt: string;
  width: number;
  height?: number;
  onResize: (newWidth: number, newHeight?: number) => void;
}

function InlineImage({ src, alt, width, height, onResize }: InlineImageProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(width);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // 当外部宽度变化时同步
  useEffect(() => {
    setCurrentWidth(width);
  }, [width]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
  }, [currentWidth]);

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

  const aspectRatio = height && width ? height / width : 0.75;
  const displayHeight = Math.round(currentWidth * aspectRatio);

  return (
    <span
      className="relative inline-block align-middle mx-1"
      style={{ width: currentWidth, height: displayHeight }}
      contentEditable={false}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain border border-gray-300 rounded"
        draggable={false}
      />
      {/* 左侧拖动手柄 */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-l border-r border-gray-300 ${
          isDragging ? 'bg-gray-200' : ''
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
        {currentWidth}px
      </span>
    </span>
  );
}

interface InlineLatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function InlineLatexEditor({
  value,
  onChange,
  placeholder = '请输入内容...',
  rows = 6,
  className = '',
}: InlineLatexEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { getImageUrl } = useImageUrl();

  // 解析内容，提取图片位置和信息
  const parsedContent = useMemo(() => {
    return parseInlineImages(value);
  }, [value]);

  // 更新图片尺寸
  const handleImageResize = useCallback((imageMarkdown: string, newWidth: number, newHeight?: number) => {
    // 解析当前图片的尺寸信息
    const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:=([0-9]+)x([0-9]+)=|"([^"]+)")?)?\)/;
    const match = imageMarkdown.match(regex);

    if (!match) return;

    const alt = match[1];
    const url = match[2];

    // 构建新的图片语法，包含新尺寸
    let newImageMarkdown: string;
    if (newHeight !== undefined) {
      newImageMarkdown = `![${alt}](${url} =${newWidth}x${newHeight}=)`;
    } else {
      // 保持原有比例，只更新宽度
      newImageMarkdown = `![${alt}](${url} =${newWidth}x${newHeight}=)`;
    }

    // 替换原文中的图片语法
    const newValue = value.replace(imageMarkdown, newImageMarkdown);
    onChange(newValue);
  }, [value, onChange]);

  const handleFocus = () => {
    setIsEditing(true);
  };

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // 延迟检查，确保点击工具栏按钮时不切换到预览模式
    setTimeout(() => {
      if (containerRef.current?.contains(document.activeElement)) {
        return;
      }
      setIsEditing(false);
    }, 150);
  }, []);

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

  // 切换到编辑模式时聚焦
  const handleClick = useCallback(() => {
    if (!isEditing) {
      setIsEditing(true);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isEditing]);

  // 预览模式下的渲染
  const renderPreview = () => {
    if (!value) {
      return <span className="text-gray-400 text-sm">{placeholder}</span>;
    }

    const parts: React.ReactNode[] = [];
    let textIndex = 0;

    parsedContent.forEach((item, idx) => {
      // 渲染图片之前的文本（带 LaTeX）
      if (item.before) {
        const htmlContent = renderLatexToHtml(item.before);
        parts.push(
          <span
            key={`text-${idx}`}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
            className="question-text"
          />
        );
      }

      // 渲染图片
      const imgWidth = item.width || 200;
      parts.push(
        <InlineImage
          key={`img-${idx}`}
          src={getImageUrl(item.url)}
          alt={item.alt}
          width={imgWidth}
          height={item.height}
          onResize={(newWidth, newHeight) => handleImageResize(item.fullMatch, newWidth, newHeight)}
        />
      );
    });

    // 渲染剩余文本
    const lastItem = parsedContent[parsedContent.length - 1];
    if (lastItem) {
      const remaining = value.substring(value.indexOf(lastItem.fullMatch) + lastItem.fullMatch.length);
      if (remaining) {
        const htmlContent = renderLatexToHtml(remaining);
        parts.push(
          <span
            key="text-end"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
            className="question-text"
          />
        );
      }
    } else {
      // 没有图片，整个内容作为文本渲染
      const htmlContent = renderLatexToHtml(value);
      parts.push(
        <span
          key="text-all"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
          className="question-text"
        />
      );
    }

    return <>{parts}</>;
  };

  return (
    <div
      ref={containerRef}
      className={`border rounded-lg overflow-hidden ${className}`}
    >
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
            提示：使用 <code className="bg-gray-200 px-1 rounded">![alt](url =WxH=)</code> 语法设置图片尺寸
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
