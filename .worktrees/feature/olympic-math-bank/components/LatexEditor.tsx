'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { LatexToolbar } from './LatexToolbar';
import { QuestionContent } from './QuestionContent';
import { ResizableImage } from './ResizableImage';
import { useImageUrl } from '@/hooks/useImageUrl';

interface LatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

// 从内容中解析出所有 markdown 图片
function parseImages(content: string): { alt: string; url: string }[] {
  const images: { alt: string; url: string }[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    images.push({ alt: match[1], url: match[2] });
  }
  return images;
}

export function LatexEditor({
  value,
  onChange,
  placeholder = '请输入内容...',
  rows = 6,
  className = '',
}: LatexEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { getImageUrl } = useImageUrl();

  // 解析内容中的图片
  const images = useMemo(() => parseImages(value), [value]);

  const handleFocus = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    // 延迟检查，确保点击工具栏按钮时不切换到预览模式
    setTimeout(() => {
      if (!textareaRef.current?.contains(document.activeElement)) {
        setIsEditing(false);
      }
    }, 150);
  };

  const handleInsert = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + text + value.substring(end);
    onChange(newValue);

    // 设置光标位置
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + text.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [value, onChange]);

  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
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
          {images.length > 0 && (
            <div className="border-t p-3 bg-gray-50">
              <p className="text-xs text-gray-500 mb-2">图片预览（可拖动调整尺寸）：</p>
              <div className="flex flex-wrap gap-4">
                {images.map((img, index) => (
                  <EditableImage
                    key={index}
                    src={getImageUrl(img.url)}
                    alt={img.alt}
                    initialWidth={200}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          onClick={() => {
            setIsEditing(true);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
          className="min-h-[100px] px-3 py-2 cursor-text"
        >
          {value ? (
            <QuestionContent content={value} />
          ) : (
            <p className="text-gray-400 text-sm">{placeholder}</p>
          )}
        </div>
      )}
    </div>
  );
}
