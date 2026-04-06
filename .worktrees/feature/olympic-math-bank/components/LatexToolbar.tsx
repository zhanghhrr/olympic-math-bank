'use client';

import { Button } from '@/components/ui/button';

interface LatexToolbarProps {
  onInsert: (text: string) => void;
}

// LaTeX 数学公式按钮配置
const latexButtons = [
  { label: '分数', insert: '\\(\\frac{}{}\\)', tooltip: '分数' },
  { label: '根号', insert: '\\(\\sqrt{}\\)', tooltip: '根号' },
  { label: '上标', insert: '^{}', tooltip: '上标' },
  { label: '下标', insert: '_{}', tooltip: '下标' },
  { label: '×', insert: ' \\times ', tooltip: '乘号' },
  { label: '÷', insert: ' \\div ', tooltip: '除号' },
  { label: '≥', insert: ' \\geq ', tooltip: '大于等于' },
  { label: '≤', insert: ' \\leq ', tooltip: '小于等于' },
  { label: '±', insert: ' \\pm ', tooltip: '正负' },
  { label: '∞', insert: ' \\infty ', tooltip: '无穷' },
  { label: '∫', insert: '\\(\\int_{}^{}\\)', tooltip: '积分' },
  { label: '∑', insert: '\\(\\sum_{}^{}\\)', tooltip: '求和' },
  { label: '≈', insert: ' \\approx ', tooltip: '约等于' },
  { label: '≠', insert: ' \\neq ', tooltip: '不等于' },
];

// 文本格式按钮配置
const textButtons = [
  { label: 'B', insert: '**文本**', tooltip: '加粗' },
  { label: '↵', insert: '\n', tooltip: '换行' },
  { label: '左', insert: ':::left\n文本\n:::\n', tooltip: '居左' },
  { label: '中', insert: ':::center\n文本\n:::\n', tooltip: '居中' },
  { label: '右', insert: ':::right\n文本\n:::\n', tooltip: '居右' },
];

export function LatexToolbar({ onInsert }: LatexToolbarProps) {
  const handleClick = (insert: string) => {
    onInsert(insert);
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
            onClick={() => handleClick(btn.insert)}
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
