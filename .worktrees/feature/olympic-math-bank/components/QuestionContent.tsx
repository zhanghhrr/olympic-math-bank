'use client';

import React, { useState, useMemo } from 'react';
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

// 对齐块类型
interface AlignBlock {
  type: 'align';
  align: 'left' | 'center' | 'right';
  content: string;
}

// 处理内容，解析图片、LaTeX 和对齐格式
function parseContent(text: string, getImageUrl: (path: string) => string): Array<{
  type: 'text' | 'image' | 'align';
  content: string;
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  align?: 'left' | 'center' | 'right';
}> {
  const parts: Array<{
    type: 'text' | 'image' | 'align';
    content: string;
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
    align?: 'left' | 'center' | 'right';
  }> = [];

  // 先解析对齐块 :::left/center/right ... :::
  // 匹配 :::left\n内容\n:::
  const alignRegex = /:::(\w+)\r?\n([\s\S]*?)\r?\n:::/g;
  let lastIndex = 0;
  let match;

  // 先处理对齐块
  const tempParts: Array<{ start: number; end: number; content: string }> = [];
  while ((match = alignRegex.exec(text)) !== null) {
    tempParts.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
    });
  }

  // 如果没有对齐块，直接处理原文
  if (tempParts.length === 0) {
    // 先渲染 LaTeX
    const htmlContent = renderLatexToHtml(text);

    // 匹配 Markdown 图片，支持 =WxH= 尺寸语法
    const mdImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:=([0-9]+)x([0-9]+)=|"([^"]+)")?)?\)/gi;
    // 匹配 HTML 图片 <img src="...">
    const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

    const combinedRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:=([0-9]+)x([0-9]+)=|"([^"]+)")?)?\)|<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

    let imgMatch;
    let imgLastIndex = 0;

    while ((imgMatch = combinedRegex.exec(htmlContent)) !== null) {
      if (imgMatch.index > imgLastIndex) {
        const textBefore = htmlContent.substring(imgLastIndex, imgMatch.index);
        if (textBefore) {
          parts.push({ type: 'text', content: textBefore });
        }
      }

      if (imgMatch[0].startsWith('![')) {
        const alt = imgMatch[1];
        const url = imgMatch[2];
        let width: number | undefined;
        let height: number | undefined;

        if (imgMatch[3] && imgMatch[4]) {
          width = parseInt(imgMatch[3], 10);
          height = parseInt(imgMatch[4], 10);
        } else if (imgMatch[5]) {
          const dimParts = imgMatch[5].split('x');
          if (dimParts.length === 2) {
            width = parseInt(dimParts[0].trim(), 10);
            height = parseInt(dimParts[1].trim(), 10);
          }
        }

        parts.push({
          type: 'image',
          content: imgMatch[0],
          src: getImageUrl(url),
          alt,
          width,
          height,
        });
      } else {
        const srcMatch = imgMatch[0].match(/src=["']([^"']+)["']/);
        const altMatch = imgMatch[0].match(/alt=["']([^"']+)["']/);
        parts.push({
          type: 'image',
          content: imgMatch[0],
          src: getImageUrl(srcMatch ? srcMatch[1] : ''),
          alt: altMatch ? altMatch[1] : '',
        });
      }

      imgLastIndex = imgMatch.index + imgMatch[0].length;
    }

    if (imgLastIndex < htmlContent.length) {
      const remaining = htmlContent.substring(imgLastIndex);
      if (remaining) {
        parts.push({ type: 'text', content: remaining });
      }
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: htmlContent }];
  }

  // 处理包含对齐块的文本
  let currentIndex = 0;
  for (const block of tempParts) {
    // 处理对齐块之前的文本
    if (block.start > currentIndex) {
      const textBefore = text.substring(currentIndex, block.start);
      if (textBefore.trim()) {
        // 递归处理这段文本
        const beforeParts = parseContent(textBefore, getImageUrl);
        parts.push(...beforeParts);
      }
    }

    // 解析对齐块
    const alignMatch = block.content.match(/:::(\w+)\r?\n([\s\S]*?)\r?\n:::/);
    if (alignMatch) {
      const alignType = alignMatch[1] as 'left' | 'center' | 'right';
      const alignContent = alignMatch[2];
      // 递归处理对齐块内的内容
      const innerParts = parseContent(alignContent, getImageUrl);
      for (const inner of innerParts) {
        parts.push({
          ...inner,
          align: alignType,
        });
      }
    }

    currentIndex = block.end;
  }

  // 处理最后剩余的文本
  if (currentIndex < text.length) {
    const remaining = text.substring(currentIndex);
    if (remaining.trim()) {
      const afterParts = parseContent(remaining, getImageUrl);
      parts.push(...afterParts);
    }
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}

export function QuestionContent({ content, className = '' }: QuestionContentProps) {
  const { getImageUrl } = useImageUrl();
  const [modalImage, setModalImage] = useState<{ src: string; alt: string } | null>(null);

  const renderedContent = useMemo(() => {
    const parts = parseContent(content, getImageUrl);
    return parts.map((part, index) => {
      let element: React.ReactNode;

      if (part.type === 'image') {
        const hasSize = part.width && part.height;
        const imgStyle: React.CSSProperties = hasSize
          ? {
              width: part.width,
              height: part.height,
              objectFit: 'contain' as const,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }
          : { maxWidth: '100%', height: 'auto' };

        element = (
          <img
            key={index}
            src={part.src}
            alt={part.alt}
            style={imgStyle}
            onClick={() => setModalImage({ src: part.src!, alt: part.alt || '' })}
          />
        );
      } else {
        element = (
          <span
            dangerouslySetInnerHTML={{ __html: part.content }}
            className="question-text"
          />
        );
      }

      if (part.align && part.align !== 'left') {
        const justify = part.align === 'center' ? 'center' : 'flex-end';
        return (
          <div key={index} style={{ display: 'flex', justifyContent: justify, marginTop: '8px', marginBottom: '8px' }}>
            {element}
          </div>
        );
      }
      if (part.align === 'left') {
        return <React.Fragment key={index}>{element}</React.Fragment>;
      }

      return <React.Fragment key={index}>{element}</React.Fragment>;
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
