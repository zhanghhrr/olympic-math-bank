'use client';

import { useState, useMemo, useRef } from 'react';
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

  // 行内公式：$...$
  text = text.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `$${latex}$`;
    }
  });

  // 行内公式：\(...\)
  text = text.replace(/\\\(([^)]+?)\\\)/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `\\(${latex}\\)`;
    }
  });

  return text;
}

// 处理内容，解析图片和 LaTeX
function parseContent(text: string, getImageUrl: (path: string) => string) {
  const parts: Array<{ type: 'text' | 'image'; content: string; src?: string; alt?: string }> = [];

  // 先渲染 LaTeX（这样图片中的 LaTeX 也会被处理）
  const htmlContent = renderLatexToHtml(text);

  // 匹配 Markdown 图片 ![alt](url) 和 HTML 图片 <img src="...">
  const combinedRegex = /!\[([^\]]*)\]\(([^)]+)\)|<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(htmlContent)) !== null) {
    // 添加图片之前的文本
    if (match.index > lastIndex) {
      const textBefore = htmlContent.substring(lastIndex, match.index);
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    if (match[0].startsWith('![')) {
      // Markdown 图片
      parts.push({
        type: 'image',
        content: match[0],
        src: getImageUrl(match[2]),
        alt: match[1],
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
            className="max-w-full h-auto cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setModalImage({ src: part.src!, alt: part.alt })}
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
