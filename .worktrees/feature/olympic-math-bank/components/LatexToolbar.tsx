'use client';

import { Button } from '@/components/ui/button';
import katex from 'katex';
import { Bold, AlignLeft, AlignCenter, AlignRight, ArrowDownToLine } from 'lucide-react';

interface LatexToolbarProps {
  onInsert: (text: string) => void;
  onLatexInsert?: (latex: string) => void;
}

// 渲染 LaTeX 到 HTML
function renderLatexToHtml(latex: string, displayMode: boolean = false): string {
  try {
    return katex.renderToString(latex.trim(), { displayMode, throwOnError: false });
  } catch {
    return displayMode ? `$$${latex}$$` : `$${latex}$`;
  }
}

// 文本格式按钮配置 - 带图标
const textButtons = [
  { icon: Bold, insert: '**文本**', tooltip: '加粗' },
  { icon: ArrowDownToLine, insert: '\n', tooltip: '换行' },
  { icon: AlignLeft, insert: ':::left\n文本\n:::\n', tooltip: '居左' },
  { icon: AlignCenter, insert: ':::center\n文本\n:::\n', tooltip: '居中' },
  { icon: AlignRight, insert: ':::right\n文本\n:::\n', tooltip: '居右' },
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

export function LatexToolbar({ onInsert, onLatexInsert }: LatexToolbarProps) {
  const handleClick = (insert: string) => {
    onInsert(insert);
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
              onClick={() => handleClick(btn.insert)}
              className="h-10 w-10 p-0 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-700"
              title={btn.tooltip}
            >
              <Icon size={22} strokeWidth={2} />
            </Button>
          );
        })}
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
