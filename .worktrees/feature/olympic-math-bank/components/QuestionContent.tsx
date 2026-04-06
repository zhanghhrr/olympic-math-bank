'use client';

import { useState, useMemo } from 'react';
import katex from 'katex';
import { useImageUrl } from '@/hooks/useImageUrl';
import { ImageModal } from './ImageModal';

interface QuestionContentProps {
  content: string;
  className?: string;
}

// 渲染 LaTeX 公式并返回 HTML
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

  // 行内公式：\(...\)，注意 \) 是转义的右括号
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

// 处理内容，解析图片和 LaTeX
function parseContent(text: string, getImageUrl: (path: string) => string) {
  const parts: Array<{
    type: 'text' | 'image';
    content: string;
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
  }> = [];

  // 先渲染 LaTeX（这样图片中的 LaTeX 也会被处理）
  const htmlContent = renderLatexToHtml(text);

  // 匹配 Markdown 图片，支持 =WxH= 尺寸语法
  // 格式：![alt](url =WxH=) 或 ![alt](url "width x height")
  const mdImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:=([0-9]+)x([0-9]+)=|"([^"]+)")?)?\)/gi;
  // 匹配 HTML 图片 <img src="...">
  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  let lastIndex = 0;
  let match;

  // 处理 Markdown 图片
  const combinedRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:=([0-9]+)x([0-9]+)=|"([^"]+)")?)?\)|<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  while ((match = combinedRegex.exec(htmlContent)) !== null) {
    // 添加图片之前的文本
    if (match.index > lastIndex) {
      const textBefore = htmlContent.substring(lastIndex, match.index);
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    if (match[0].startsWith('![')) {
      // Markdown 图片，解析尺寸
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
        const dimParts = match[5].split('x');
        if (dimParts.length === 2) {
          width = parseInt(dimParts[0].trim(), 10);
          height = parseInt(dimParts[1].trim(), 10);
        }
      }

      parts.push({
        type: 'image',
        content: match[0],
        src: getImageUrl(url),
        alt,
        width,
        height,
      });
      lastIndex = match.index + match[0].length;
    } else {
      // HTML 图片
      const srcMatch = match[0].match(/src=["']([^"']+)["']/);
      const altMatch = match[0].match(/alt=["']([^"']+)["']/);
      parts.push({
        type: 'image',
        content: match[0],
        src: getImageUrl(srcMatch ? srcMatch[1] : ''),
        alt: altMatch ? altMatch[1] : '',
      });
      lastIndex = match.index + match[0].length;
    }
  }

  // 添加剩余文本
  if (lastIndex < htmlContent.length) {
    const remaining = htmlContent.substring(lastIndex);
    if (remaining) {
      parts.push({ type: 'text', content: remaining });
    }
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: htmlContent }];
}

export function QuestionContent({ content, className = '' }: QuestionContentProps) {
  const { getImageUrl } = useImageUrl();
  const [modalImage, setModalImage] = useState<{ src: string; alt: string } | null>(null);

  const renderedContent = useMemo(() => {
    const parts = parseContent(content, getImageUrl);
    return parts.map((part, index) => {
      if (part.type === 'image') {
        return (
          <img
            key={index}
            src={part.src}
            alt={part.alt}
            width={part.width}
            height={part.height}
            style={part.width ? { width: part.width, height: part.height || 'auto' } : undefined}
            className={part.width ? '' : 'max-w-full h-auto'}
            onClick={() => setModalImage({ src: part.src!, alt: part.alt || '' })}
          />
        );
      }
      return (
        <span
          key={index}
          dangerouslySetInnerHTML={{ __html: part.content }}
          className="question-text"
        />
      );
    });
  }, [content, getImageUrl]);

  return (
    <div className={`question-content ${className}`}>
      {renderedContent}
      {modalImage && (
        <ImageModal
          src={modalImage.src}
          alt={modalImage.alt}
          isOpen={true}
          onClose={() => setModalImage(null)}
        />
      )}
    </div>
  );
}
