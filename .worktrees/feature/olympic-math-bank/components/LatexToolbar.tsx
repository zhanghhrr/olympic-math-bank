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
    if (type === 'bold') {
      // 加粗：用 ** 包裹选中文本
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const selectedText = selection.toString().trim();
      if (!selectedText) return;
      const wrappedText = `**${selectedText}**`;
      document.execCommand('insertText', false, wrappedText);
      return;
    }

    // 对齐操作：直接操作 DOM 而不是插入 markdown 标记
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;

    // 查找是否有点中的图片（检查是否有 .image-wrapper 被选中）
    const selectedImageWrapper = (() => {
      // 检查选中的内容是否包含图片
      const rangeClone = range.cloneRange();
      rangeClone.collapse(true);
      // 尝试找到图片 wrapper
      let node: Node | null = startNode;
      while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.classList?.contains('image-wrapper')) {
            return el;
          }
          // 检查是否有被选中的图片
          if (el.tagName === 'IMG' && el.closest('.image-wrapper')) {
            return el.closest('.image-wrapper') as HTMLElement;
          }
        }
        node = node.parentNode;
      }
      // 检查 selection 是否包含图片
      if (selection.toString().includes('<img')) {
        const imgMatch = selection.toString().match(/<img[^>]*>/);
        if (imgMatch) {
          // 查找页面中的图片
          const allWrappers = document.querySelectorAll('.image-wrapper');
          for (const wrapper of allWrappers) {
            if (wrapper.innerHTML.includes(imgMatch[0])) {
              return wrapper as HTMLElement;
            }
          }
        }
      }
      return null;
    })();

    // 如果有图片被选中，设置图片对齐
    if (selectedImageWrapper) {
      // 先检查图片是否已经在 align-wrapper 内部
      const parentAlignWrapper = selectedImageWrapper.closest('.align-wrapper') as HTMLElement | null;

      if (parentAlignWrapper) {
        // 图片已在 align-wrapper 内，只更新外层对齐
        const currentAlign = parentAlignWrapper.getAttribute('data-align') || 'left';
        if (currentAlign !== type) {
          parentAlignWrapper.setAttribute('data-align', type);
          parentAlignWrapper.style.textAlign = type;
          parentAlignWrapper.style.borderColor = type === 'left' ? '#3b82f6' : type === 'center' ? '#8b5cf6' : '#ef4444';
          const labelEl = parentAlignWrapper.querySelector('div[style*="position:absolute"]');
          if (labelEl) {
            labelEl.textContent = type === 'left' ? '居左' : type === 'center' ? '居中' : '居右';
          }
        }
        return;
      }

      const currentAlign = selectedImageWrapper.getAttribute('data-align') || 'center';
      if (currentAlign !== type) {
        // 创建对齐块
        const alignDiv = createAlignDiv(type);
        const contentDiv = alignDiv.querySelector('.align-content')!;

        // 更新图片的对齐属性
        selectedImageWrapper.setAttribute('data-align', type);

        // 从 DOM 中移除图片
        const parent = selectedImageWrapper.parentNode;
        if (parent) {
          parent.removeChild(selectedImageWrapper);
        }

        // 把图片移入对齐块
        contentDiv.appendChild(selectedImageWrapper);

        // 把对齐块插入到原来图片的位置
        if (parent) {
          parent.appendChild(alignDiv);
        }

        // 将光标移到对齐块内
        const finalRange = document.createRange();
        finalRange.setStart(contentDiv, 0);
        finalRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(finalRange);
      }
      return;
    }

    // 查找光标所在的 align-wrapper 或 image-wrapper
    let node: Node | null = startNode;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.classList?.contains('align-wrapper')) {
          // 找到了对齐块，修改对齐
          const currentAlign = el.getAttribute('data-align') || 'left';
          if (currentAlign !== type) {
            el.setAttribute('data-align', type);
            // 更新样式
            el.style.textAlign = type;
            el.style.borderColor = type === 'left' ? '#3b82f6' : type === 'center' ? '#8b5cf6' : '#ef4444';
            // 更新标签
            const labelEl = el.querySelector('div[style*="position:absolute"]');
            if (labelEl) {
              labelEl.textContent = type === 'left' ? '居左' : type === 'center' ? '居中' : '居右';
            }
          }
          return;
        }
      }
      node = node.parentNode;
    }

    // 如果都没找到，在光标位置插入新的对齐块 DOM 元素
    // 但先检查光标所在行是否有图片，如果有，把该图片移入对齐块
    const currentRange = selection.getRangeAt(0);
    const startContainer = currentRange.startContainer;

    // 找到光标所在行内最近的 image-wrapper
    let lineNode: Node | null = startContainer;
    let imageWrapper: HTMLElement | null = null;

    // 在同级节点中向前找 image-wrapper
    while (lineNode && lineNode.previousSibling) {
      const prev: Node | null = lineNode.previousSibling;
      if (prev.nodeType === Node.ELEMENT_NODE) {
        const el = prev as HTMLElement;
        if (el.classList?.contains('image-wrapper')) {
          imageWrapper = el;
          break;
        }
      }
      lineNode = prev;
    }

    // 如果向前没找到，向后找
    if (!imageWrapper && startContainer.parentNode) {
      const parent = startContainer.parentNode;
      if (parent.nodeType === Node.ELEMENT_NODE) {
        const next = (parent as HTMLElement).nextElementSibling;
        if (next?.classList?.contains('image-wrapper')) {
          imageWrapper = next as HTMLElement;
        }
      }
    }

    // 如果找到了 image-wrapper，用对齐块包裹它
    if (imageWrapper) {
      const alignDiv = createAlignDiv(type);
      const contentDiv = alignDiv.querySelector('.align-content')!;

      // 把图片移入对齐块
      if (imageWrapper.parentNode) {
        imageWrapper.parentNode.insertBefore(alignDiv, imageWrapper);
        contentDiv.appendChild(imageWrapper);
      }

      // 将光标移到对齐块内
      const finalRange = document.createRange();
      finalRange.setStart(contentDiv, 0);
      finalRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(finalRange);
      return;
    }

    // 找到当前行（段落）的起始和结束位置
    let lineStart: Node = startContainer;
    let lineEnd: Node = startContainer;

    // 向前找行的开始（遇到块级元素或内容开头为止）
    while (lineStart.previousSibling) {
      const prev = lineStart.previousSibling;
      if (prev.nodeType === Node.ELEMENT_NODE) {
        const el = prev as HTMLElement;
        // 块级元素是行的分隔
        if (el.tagName === 'DIV' || el.tagName === 'P' || el.tagName === 'BR') {
          break;
        }
      }
      lineStart = prev;
    }

    // 向后找行的结束
    while (lineEnd.nextSibling) {
      const next = lineEnd.nextSibling;
      if (next.nodeType === Node.ELEMENT_NODE) {
        const el = next as HTMLElement;
        if (el.tagName === 'DIV' || el.tagName === 'P' || el.tagName === 'BR') {
          break;
        }
      }
      lineEnd = next;
    }

    // 创建覆盖整行的范围
    const lineRange = document.createRange();
    lineRange.setStartBefore(lineStart);
    lineRange.setEndAfter(lineEnd);

    const selectedText = lineRange.toString();

    // 如果没有有效内容，插入空对齐块
    if (!selectedText.trim()) {
      const alignDiv = createAlignDiv(type);
      currentRange.insertNode(alignDiv);
      const emptyRange = document.createRange();
      emptyRange.setStart(alignDiv.querySelector('.align-content')!, 0);
      emptyRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(emptyRange);
      return;
    }

    // 用对齐块包裹整行
    const alignDiv = createAlignDiv(type);
    const contentDiv = alignDiv.querySelector('.align-content')!;

    const fragment = lineRange.extractContents();
    contentDiv.appendChild(fragment);

    lineRange.insertNode(alignDiv);

    // 将光标移到对齐块内
    const finalRange = document.createRange();
    finalRange.setStart(contentDiv, 0);
    finalRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(finalRange);
  };

  // 创建对齐块 DOM 元素的辅助函数
  function createAlignDiv(type: WrapType): HTMLDivElement {
    const alignDiv = document.createElement('div');
    alignDiv.className = 'align-wrapper';
    alignDiv.setAttribute('data-align', type);
    alignDiv.setAttribute('contentEditable', 'true');
    alignDiv.setAttribute('spellcheck', 'false');

    const labelDiv = document.createElement('div');
    labelDiv.style.cssText = 'position:absolute;top:-10px;left:8px;background:#fff;padding:0 6px;font-size:11px;color:#64748b;border-radius:3px;';
    labelDiv.textContent = type === 'left' ? '居左' : type === 'center' ? '居中' : '居右';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'align-content';
    contentDiv.setAttribute('contentEditable', 'true');
    contentDiv.style.cssText = `outline:none;text-align:${type};`;

    const textColor = type === 'left' ? '#3b82f6' : type === 'center' ? '#8b5cf6' : '#ef4444';
    alignDiv.style.cssText = `display:block;text-align:${type};background:#f0f9ff;border:2px solid ${textColor};padding:8px 12px;border-radius:6px;margin:8px 0;min-width:100px;position:relative;`;

    alignDiv.appendChild(labelDiv);
    alignDiv.appendChild(contentDiv);

    return alignDiv;
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
