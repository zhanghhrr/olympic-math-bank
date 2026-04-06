'use client';

import { useState, useRef, useCallback } from 'react';
import { LatexToolbar } from './LatexToolbar';
import { QuestionContent } from './QuestionContent';

interface LatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
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
