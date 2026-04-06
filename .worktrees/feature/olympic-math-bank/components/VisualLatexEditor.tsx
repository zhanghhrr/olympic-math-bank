'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { GripHorizontal, GripCorner } from 'lucide-react';
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

// 将 markdown 内容转换为用于预览的 HTML（渲染 LaTeX）
function markdownToPreviewHtml(text: string, baseUrl: string): string {
  if (!text) return '';

  let result = text;

  // 块级公式：$$...$$ - 先不处理，避免与 $...$ 冲突
  // 处理行内公式 $...$
  const latexInlineRegex = /\$([^$\n]+?)\$/g;
  result = result.replace(latexInlineRegex, (_, latex) => {
    try {
      return `<span class="katex-inline" data-latex="${latex.replace(/"/g, '&quot;')}">${latex}</span>`;
    } catch {
      return `$${latex}$`;
    }
  });

  // 处理块级公式 \[...\]
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => {
    try {
      return `<span class="katex-block" data-latex="${latex.replace(/"/g, '&quot;')}">${latex}</span>`;
    } catch {
      return `\\[${latex}\\]`;
    }
  });

  // 处理块级公式 $$...$$
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    try {
      return `<span class="katex-block" data-latex="${latex.replace(/"/g, '&quot;')}">${latex}</span>`;
    } catch {
      return `$$${latex}$$`;
    }
  });

  // 处理图片
  const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([0-9]+)x([0-9]+)=)?\s*\)/g;
  result = result.replace(imageRegex, (match, alt, url, w, h) => {
      const width = w || 200;
      const height = h || Math.round(width * 0.75);
      const imgUrl = getImageUrl(url, baseUrl);
      return `<span class="image-wrapper" data-url="${url}" data-width="${width}" data-height="${height}" data-original="${match}"><img src="${imgUrl}" alt="${alt}" width="${width}" height="${height}" class="content-image" style="width:${width}px;height:${height}px" /><span class="resize-handle"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></span></span>`;
    });

  return result;
}

// 将 markdown 内容转换为用于编辑的纯文本（公式不渲染）
function markdownToEditText(text: string): string {
  if (!text) return '';
  // 直接返回原文，图片语法保持不变
  return text;
}

// 将 HTML 转回 markdown
function htmlToMarkdown(html: string, baseUrl: string): string {
  let text = html;

  // 提取图片信息
  text = text.replace(/<span class="image-wrapper"[^>]*>[\s\S]*?<img[^>]+src="[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, (match, markdown) => {
    // 直接使用保存的 markdown 语法
    const urlMatch = match.match(/data-url="([^"]+)"/);
    const widthMatch = match.match(/data-width="([^"]+)"/);
    const heightMatch = match.match(/data-height="([^"]+)"/);
    const altMatch = match.match(/alt="([^"]+)"/);

    if (urlMatch && widthMatch && heightMatch) {
      const alt = altMatch ? altMatch[1] : '';
      return `![${alt}](${urlMatch[1]} =${widthMatch[1]}x${heightMatch[1]}=)`;
    }
    return markdown.trim();
  });

  // 清理其他标签，保留 LaTeX 源码
  text = text.replace(/<span class="katex-(?:inline|block)"[^>]*>([\s\S]*?)<\/span>/gi, (_, latex) => {
    // 直接返回原始 LaTeX 语法
    return latex;
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
    aspectRatio: number;
  }>({ active: false, target: null, startX: 0, startY: 0, startWidth: 0, aspectRatio: 1 });

  // 初始化编辑器内容 - 编辑模式显示纯文本
  useEffect(() => {
    if (isEditing && editorRef.current) {
      const editText = markdownToEditText(value);
      if (editorRef.current.innerText !== editText) {
        editorRef.current.innerText = editText;
      }
    }
  }, [isEditing, value]);

  // 处理输入
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText;
    onChange(text);
  }, [onChange]);

  // 鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 检查是否点击图片
    const img = target.closest('.content-image') as HTMLImageElement;
    if (img) {
      const wrapper = img.parentElement;
      if (!wrapper) return;

      const rect = img.getBoundingClientRect();
      const inCorner = (
        e.clientX >= rect.right - 30 &&
        e.clientY >= rect.bottom - 30 &&
        e.clientX <= rect.right &&
        e.clientY <= rect.bottom
      );

      if (inCorner) {
        e.preventDefault();
        e.stopPropagation();

        const width = parseInt(wrapper.getAttribute('data-width') || '200');
        const height = parseInt(wrapper.getAttribute('data-height') || '150');
        const aspectRatio = height / width;

        dragRef.current = {
          active: true,
          target: img,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: width,
          aspectRatio,
        };

        img.style.opacity = '0.8';
        return;
      }
    }

    // 点击其他区域进入编辑模式
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
    const wrapper = img.parentElement;

    img.style.width = `${newWidth}px`;
    img.style.height = `${newHeight}px`;
    if (wrapper) {
      wrapper.setAttribute('data-width', String(newWidth));
      wrapper.setAttribute('data-height', String(newHeight));
    }
  }, []);

  // 鼠标松开
  const handleMouseUp = useCallback(() => {
    if (dragRef.current.active && dragRef.current.target) {
      const img = dragRef.current.target;
      const wrapper = img.parentElement;
      img.style.opacity = '1';

      // 保存变化到 value
      if (wrapper) {
        const url = wrapper.getAttribute('data-url') || '';
        const width = wrapper.getAttribute('data-width') || '200';
        const height = wrapper.getAttribute('data-height') || '150';
        const newMarkdown = `![](${url} =${width}x${height}=)`;

        // 替换原文中的旧图片语法
        const oldMarkdown = wrapper.getAttribute('data-original') || '';
        if (oldMarkdown) {
          const newValue = value.replace(oldMarkdown, newMarkdown);
          onChange(newValue);
        }
      }
    }

    dragRef.current = { active: false, target: null, startX: 0, startY: 0, startWidth: 0, aspectRatio: 1 };
  }, [value, onChange]);

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
        if (editorRef.current) {
          const text = editorRef.current.innerText;
          onChange(text);
        }
        setIsEditing(false);
      }
    }, 100);
  }, [onChange]);

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
      <style>{`
        .image-wrapper {
          position: relative;
          display: inline-block;
        }
        .content-image {
          display: block;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
        }
        .resize-handle {
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 20px;
          height: 20px;
          background: rgba(59, 130, 246, 0.9);
          border-radius: 4px 0 4px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: se-resize;
          opacity: 0;
          transition: opacity 0.2s;
          color: white;
        }
        .image-wrapper:hover .resize-handle {
          opacity: 1;
        }
      `}</style>
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
            className="min-h-[150px] px-3 py-2 focus:outline-none leading-relaxed font-mono text-sm whitespace-pre-wrap"
            style={{ whiteSpace: 'pre-wrap' }}
          />
          <div className="border-t px-3 py-2 bg-gray-50 text-xs text-gray-500">
            编辑模式：公式显示为源码，输入 markdown 图片语法如 ![alt](url =WxH=)
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
