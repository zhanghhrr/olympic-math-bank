'use client';

import { Button } from '@/components/ui/button';
import katex from 'katex';

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

// LaTeX 数学公式按钮配置
const latexButtons = [
  { label: '分数', template: '\\(\\frac{}{}\\)', tooltip: '分数' },
  { label: '根号', template: '\\(\\sqrt{}\\)', tooltip: '根号' },
  { label: '上标', template: '^{}', tooltip: '上标' },
  { label: '下标', template: '_{}', tooltip: '下标' },
  { label: '×', template: ' \\times ', tooltip: '乘号' },
  { label: '÷', template: ' \\div ', tooltip: '除号' },
  { label: '≥', template: ' \\geq ', tooltip: '大于等于' },
  { label: '≤', template: ' \\leq ', tooltip: '小于等于' },
  { label: '±', template: ' \\pm ', tooltip: '正负' },
  { label: '∞', template: ' \\infty ', tooltip: '无穷' },
  { label: '∫', template: '\\(\\int_{}^{}\\)', tooltip: '积分' },
  { label: '∑', template: '\\(\\sum_{}^{}\\)', tooltip: '求和' },
  { label: '≈', template: ' \\approx ', tooltip: '约等于' },
  { label: '≠', template: ' \\neq ', tooltip: '不等于' },
];

// 文本格式按钮配置
const textButtons = [
  { label: 'B', insert: '**文本**', tooltip: '加粗' },
  { label: '↵', insert: '\n', tooltip: '换行' },
  { label: '左', insert: ':::left\n文本\n:::\n', tooltip: '居左' },
  { label: '中', insert: ':::center\n文本\n:::\n', tooltip: '居中' },
  { label: '右', insert: ':::right\n文本\n:::\n', tooltip: '居右' },
];

export function LatexToolbar({ onInsert, onLatexInsert }: LatexToolbarProps) {
  const handleClick = (insert: string) => {
    onInsert(insert);
  };

  const handleLatexClick = (template: string) => {
    if (onLatexInsert) {
      // 提取 LaTeX 内容并渲染为 HTML
      onLatexInsert(template);
    } else {
      // 回退到纯文本插入
      onInsert(template);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b bg-slate-50">
      <div className="flex gap-1 border-r pr-2 mr-2">
        {latexButtons.map((btn) => (
          <Button
            key={btn.label}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleLatexClick(btn.template)}
            className="h-8 px-2 text-xs font-mono"
            title={btn.tooltip}
          >
            {btn.label}
          </Button>
        ))}
      </div>
      <div className="flex gap-1">
        {textButtons.map((btn) => (
          <Button
            key={btn.tooltip}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleClick(btn.insert)}
            className="h-8 px-2 text-xs font-medium"
            title={btn.tooltip}
          >
            {btn.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
