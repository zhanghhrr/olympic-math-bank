'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import katex from 'katex';
import { GripVertical } from 'lucide-react';
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

  // 块级公式：$$...$$
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => renderLatex(latex, true));

  // 块级公式：\[...\]
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => renderLatex(latex, true));

  // 行内公式：\(...\)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => renderLatex(latex, false));

  // 行内公式：$...$
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
}

function parseImages(text: string): ImageData[] {
  const images: ImageData[] = [];
  const regex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const w = m[3] ? parseInt(m[3]) : 200;
    images.push({
      match: m[0],
      alt: m[1],
      url: m[2],
      width: w,
      height: Math.round(w * 0.75),
    });
  }
  return images;
}

// 将 markdown 内容转换为 HTML（用于 contenteditable）
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

    // 文本部分
    if (pos > lastIndex) {
      html += renderLatexInText(text.substring(lastIndex, pos));
    }

    // 图片
    const imgUrl = getImageUrl(img.url, baseUrl);
    html += `<img src="${imgUrl}" alt="${img.alt}" data-width="${img.width}" data-height="${img.height}" style="width:${img.width}px;height:${img.height}px;display:inline-block;vertical-align:middle;margin:0 4px;border:1px solid #e5e7eb;border-radius:4px;" />`;

    lastIndex = pos + img.match.length;
  });

  // 剩余文本
  if (lastIndex < text.length) {
    html += renderLatexInText(text.substring(lastIndex));
  }

  return html;
}

// 将 HTML 转回 markdown
function htmlToMarkdown(html: string): string {
  let text = html;

  // 替换图片
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

    // 移除 API 前缀获取原始路径
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

  // 清理其他 HTML 标签
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
  const [localHtml, setLocalHtml] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';

  // 拖动状态
  const dragState = useRef<{
    isDragging: boolean;
    target: HTMLImageElement | null;
    startX: number;
    startWidth: number;
  }>({ isDragging: false, target: null, startX: 0, startWidth: 0 });

  // 初始化编辑器内容
  useEffect(() => {
    if (isEditing && editorRef.current) {
      const html = markdownToHtml(value, baseUrl);
      if (editorRef.current.innerHTML !== html) {
        editorRef.current.innerHTML = html;
        setLocalHtml(html);
      }
    }
  }, [isEditing, value, baseUrl]);

  // 处理内容变化
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setLocalHtml(html);

    // 转换为 markdown 并保存
    const markdown = htmlToMarkdown(html);
    onChange(markdown);
  }, [onChange]);

  // 处理图片拖动
  const handleMouseDown = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // 检查是否点击了图片
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;

      // 检查是否点击了左侧调整区域（图片左边缘 20px 范围内）
      const rect = img.getBoundingClientRect();
      if (e.clientX - rect.left < 20) {
        e.preventDefault();
        e.stopPropagation();

        dragState.current = {
          isDragging: true,
          target: img,
          startX: e.clientX,
          startWidth: parseInt(img.getAttribute('data-width') || '200'),
        };

        img.style.opacity = '0.7';
        img.style.cursor = 'ew-resize';
      }
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current.isDragging || !dragState.current.target) return;

    const delta = e.clientX - dragState.current.startX;
    const newWidth = Math.max(50, Math.min(800, dragState.current.startWidth + delta));

    const img = dragState.current.target;
    const aspectRatio = parseInt(img.getAttribute('data-height') || '150') / parseInt(img.getAttribute('data-width') || '200');
    const newHeight = Math.round(newWidth * aspectRatio);

    img.style.width = `${newWidth}px`;
    img.style.height = `${newHeight}px`;
    img.setAttribute('data-width', String(newWidth));
    img.setAttribute('data-height', String(newHeight));

    // 显示宽度提示
    let tooltip = img.parentElement?.querySelector('.resize-tooltip') as HTMLElement;
    if (!tooltip) {
      tooltip = document.createElement('span');
      tooltip.className = 'resize-tooltip absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap';
      tooltip.style.position = 'absolute';
      img.parentElement?.appendChild(tooltip);
    }
    tooltip.textContent = `${newWidth}px`;
    tooltip.style.display = 'block';
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragState.current.isDragging && dragState.current.target) {
      const img = dragState.current.target;
      img.style.opacity = '1';
      img.style.cursor = '';

      // 隐藏提示
      const tooltip = img.parentElement?.querySelector('.resize-tooltip') as HTMLElement;
      if (tooltip) {
        tooltip.style.display = 'none';
      }

      // 保存变化
      const html = editorRef.current?.innerHTML || '';
      setLocalHtml(html);
      const markdown = htmlToMarkdown(html);
      onChange(markdown);
    }

    dragState.current = { isDragging: false, target: null, startX: 0, startWidth: 0 };
  }, [onChange]);

  // 添加全局鼠标事件
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

  // 处理粘贴（只接受纯文本）
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // 处理工具栏插入
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

  // 切换到编辑模式
  const enterEditMode = useCallback(() => {
    setIsEditing(true);
  }, []);

  // 离开编辑模式
  const leaveEditMode = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const markdown = htmlToMarkdown(html);
      onChange(markdown);
    }
    setIsEditing(false);
  }, [onChange]);

  // 点击编辑器
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 如果点击的是图片，不进入编辑模式
    if (target.tagName === 'IMG') {
      const rect = target.getBoundingClientRect();
      // 如果点击的是左侧调整区域，让拖动处理
      if (e.clientX - rect.left >= 20) {
        enterEditMode();
      }
      return;
    }

    // 如果还没进入编辑模式，进入
    if (!isEditing) {
      enterEditMode();
    }
  }, [isEditing, enterEditMode]);

  // 预览模式渲染
  const renderPreview = () => {
    if (!value) {
      return <span className="text-gray-400 text-sm">{placeholder}</span>;
    }

    const html = markdownToHtml(value, baseUrl);

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
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            className="min-h-[150px] px-3 py-2 focus:outline-none leading-relaxed"
            style={{ whiteSpace: 'pre-wrap' }}
          />
          <div className="border-t px-3 py-2 bg-gray-50 text-xs text-gray-500">
            提示：输入 markdown 语法如 ![alt](url =WxH=) 插入图片，点击图片拖动左侧边缘调整大小
          </div>
        </>
      ) : (
        <div
          onClick={handleClick}
          className="min-h-[100px] px-3 py-2 cursor-text leading-relaxed"
        >
          {renderPreview()}
        </div>
      )}
    </div>
  );
}
