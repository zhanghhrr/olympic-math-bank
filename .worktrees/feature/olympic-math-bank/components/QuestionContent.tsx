'use client';

import { useState, useMemo } from 'react';
import katex from 'katex';
import { useImageUrl } from '@/hooks/useImageUrl';
import { ImageModal } from './ImageModal';

interface QuestionContentProps {
  content: string;
  className?: string;
}

// 解析 LaTeX 公式（处理所有格式）
function renderLatex(text: string): string {
  if (!text) return text;

  // 块级公式：$$...$$ 和 \[...\]
  let result = text
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
      try {
        return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return `$$${latex}$$`;
      }
    })
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => {
      try {
        return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return `\\[${latex}\\]`;
      }
    });

  // 行内公式：$...$ 和 \(...\)
  result = result
    .replace(/\$([^$\n]+?)\$/g, (_, latex) => {
      try {
        return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return `$${latex}$`;
      }
    })
    .replace(/\\\(([^)]+?)\\\)/g, (_, latex) => {
      try {
        return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return `\\(${latex}\\)`;
      }
    });

  return result;
}

// 解析图片（Markdown 和 HTML 格式）
function parseImages(text: string, getImageUrl: (path: string) => string): Array<{ type: 'text' | 'image'; content: string; src?: string; alt?: string }> {
  const parts: Array<{ type: 'text' | 'image'; content: string; src?: string; alt?: string }> = [];

  // Markdown 图片：![alt](url) 或 ![](url)
  const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  // HTML 图片：<img src="..." alt="..." /> 或 <img ...>
  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  let lastIndex = 0;
  let match;

  // 合并两种图片格式的位置
  const imageMatches: Array<{ index: number; type: 'md' | 'html'; src: string; alt: string }> = [];

  while ((match = mdImageRegex.exec(text)) !== null) {
    imageMatches.push({ index: match.index, type: 'md', src: match[2], alt: match[1] });
  }

  mdImageRegex.lastIndex = 0;
  while ((match = htmlImageRegex.exec(text)) !== null) {
    const srcMatch = match[0].match(/src=["']([^"']+)["']/);
    const altMatch = match[0].match(/alt=["']([^"']+)["']/);
    imageMatches.push({
      index: match.index,
      type: 'html',
      src: srcMatch ? srcMatch[1] : '',
      alt: altMatch ? altMatch[1] : '',
    });
  }

  // 按位置排序
  imageMatches.sort((a, b) => a.index - b.index);

  // 移除 HTML 图片标签（用占位符代替）
  let cleanText = text.replace(/<img[^>]+>/gi, '<<<IMAGE>>>');

  // 按位置切分文本
  imageMatches.forEach((img) => {
    const beforeText = cleanText.substring(lastIndex, img.index);
    if (beforeText) {
      parts.push({ type: 'text', content: beforeText });
    }
    parts.push({
      type: 'image',
      content: img.type === 'md' ? `![${img.alt}](${img.src})` : img.src,
      src: getImageUrl(img.src),
      alt: img.alt,
    });
    lastIndex = img.index + (img.type === 'md' ? `![${img.alt}](${img.src})`.length : text.substring(img.index).match(/<img[^>]+>/)?.[0].length || 0);
  });

  // 最后一段文本
  const remainingText = cleanText.substring(lastIndex);
  if (remainingText) {
    parts.push({ type: 'text', content: remainingText });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}

export function QuestionContent({ content, className = '' }: QuestionContentProps) {
  const { getImageUrl } = useImageUrl();
  const [modalImage, setModalImage] = useState<{ src: string; alt: string } | null>(null);

  const renderedContent = useMemo(() => {
    const parts = parseImages(content, getImageUrl);
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
      // 渲染 LaTeX
      const html = renderLatex(part.content);
      return (
        <span
          key={index}
          dangerouslySetInnerHTML={{ __html: html }}
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
