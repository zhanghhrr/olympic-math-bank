'use client';

import { Button } from '@/components/ui/button';
import katex from 'katex';
import { Bold, AlignLeft, AlignCenter, AlignRight, ImageIcon } from 'lucide-react';

interface LatexToolbarProps {
  onInsert: (text: string) => void;
  onLatexInsert?: (latex: string) => void;
  showImageButton?: boolean;
}

// 渲染 LaTeX 到 HTML
function renderLatexToHtml(latex: string, displayMode: boolean = false): string {
  try {
    return katex.renderToString(latex.trim(), { displayMode, throwOnError: false });
  } catch {
    return displayMode ? `$$${latex}$$` : `$${latex}$`;
  }
}

// 文本格式按钮配置
type WrapType = 'bold' | 'left' | 'center' | 'right';
const textButtons: { icon: typeof Bold; type: WrapType; tooltip: string }[] = [
  { icon: Bold, type: 'bold', tooltip: '加粗' },
  { icon: AlignLeft, type: 'left', tooltip: '居左' },
  { icon: AlignCenter, type: 'center', tooltip: '居中' },
  { icon: AlignRight, type: 'right', tooltip: '居右' },
];

// LaTeX 数学公式按钮配置
const latexButtons = [
  { label: '÷', template: '\\div', tooltip: '除号' },
  { label: '×', template: '\\times', tooltip: '乘号' },
  { label: '±', template: '\\pm', tooltip: '正负' },
  { label: '≠', template: '\\neq', tooltip: '不等于' },
  { label: '≥', template: '\\geq', tooltip: '大于等于' },
  { label: '≤', template: '\\leq', tooltip: '小于等于' },
  { label: '≈', template: '\\approx', tooltip: '约等于' },
  { label: '∞', template: '\\infty', tooltip: '无穷' },
  { label: '½', template: '\\frac{}{}', tooltip: '分数', hasPlaceholder: true },
  { label: '√', template: '\\sqrt{}', tooltip: '根号', hasPlaceholder: true },
  { label: 'xⁿ', template: '^{}', tooltip: '上标', hasPlaceholder: true },
  { label: 'xₙ', template: '_{}', tooltip: '下标', hasPlaceholder: true },
  { label: '∑', template: '\\sum', tooltip: '求和' },
  { label: '∫', template: '\\int', tooltip: '积分' },
];

export function LatexToolbar({ onInsert, onLatexInsert, showImageButton = false }: LatexToolbarProps) {
  // 处理文本格式化（加粗或段落对齐）
  const handleTextFormat = (type: WrapType) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return;
    }

    if (type === 'bold') {
      // 加粗：用 ** 包裹选中文本
      const wrappedText = `**${selectedText}**`;
      document.execCommand('insertText', false, wrappedText);
    } else {
      // 段落对齐：找到选中文本所在的段落，整个段落用对齐标记包裹
      const range = selection.getRangeAt(0);
      
      // 找到段落元素（向上查找 div 或 p）
      let paragraphNode: Node | null = range.commonAncestorContainer;
      
      // 如果当前节点是文本节点，找到其父元素
      if (paragraphNode.nodeType === Node.TEXT_NODE) {
        paragraphNode = paragraphNode.parentElement;
      }
      
      // 向上查找最近的块级元素
      while (paragraphNode && paragraphNode.nodeName !== 'DIV' && paragraphNode.nodeName !== 'P') {
        paragraphNode = paragraphNode.parentElement;
      }
      
      if (!paragraphNode) {
        paragraphNode = range.commonAncestorContainer;
      }

      // 获取段落文本内容
      const paragraphText = paragraphNode.textContent || '';
      
      // 构建对齐格式：:::type\n段落内容\n:::
      const alignStart = `:::${type}\n`;
      const alignEnd = `\n:::`;
      
      // 替换整个段落内容为带对齐标记的文本
      const wrappedText = alignStart + paragraphText + alignEnd;
      
      // 使用 insertText 插入（会替换选中文本）
      document.execCommand('insertText', false, wrappedText);
    }
  };

  const handleClick = (insert: string, isImage?: boolean) => {
    if (isImage) {
      // 触发自定义事件让父组件处理
      const event = new CustomEvent('insert-image');
      document.dispatchEvent(event);
    } else {
      onInsert(insert);
    }
  };

  const handleLatexClick = (template: string) => {
    if (onLatexInsert) {
      onLatexInsert(template);
    } else {
      onInsert(template);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b bg-gradient-to-r from-slate-50 to-slate-100">
      {/* 文本格式按钮 - 左边 */}
      <div className="flex gap-1 border-r border-slate-300 pr-2 mr-2">
        {textButtons.map((btn) => {
          const Icon = btn.icon;
          return (
            <Button
              key={btn.tooltip}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleTextFormat(btn.type)}
              className="h-10 w-10 p-0 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-700"
              title={btn.tooltip}
            >
              <Icon size={22} strokeWidth={2} />
            </Button>
          );
        })}
        {showImageButton && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleClick('![alt](url)', true)}
            className="h-10 w-10 p-0 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-700"
            title="插入图片"
          >
            <ImageIcon size={22} strokeWidth={2} />
          </Button>
        )}
      </div>

      {/* LaTeX 公式按钮 - 右边 */}
      <div className="flex gap-1 flex-wrap">
        {latexButtons.map((btn) => (
          <Button
            key={btn.tooltip}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleLatexClick(btn.template)}
            className="h-10 w-10 p-0 flex items-center justify-center rounded-lg hover:bg-blue-100 text-blue-700 font-bold text-base"
            title={btn.tooltip}
          >
            {btn.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
