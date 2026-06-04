'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface ResizableImageProps {
  src: string;
  alt?: string;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  onSizeChange?: (width: number, height: number) => void;
  onClick?: () => void;
}

type HandlePosition = 'nw' | 'ne' | 'sw' | 'se';

export function ResizableImage({
  src,
  alt = '',
  initialWidth = 300,
  initialHeight = 200,
  minWidth = 50,
  minHeight = 50,
  maxWidth = 800,
  maxHeight = 600,
  onSizeChange,
  onClick,
}: ResizableImageProps) {
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<HandlePosition | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const aspectRatio = initialWidth / initialHeight;

  const handleMouseDown = useCallback((e: React.MouseEvent, handle: HandlePosition) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setActiveHandle(handle);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
  }, [size.width, size.height]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !activeHandle) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    let newWidth = dragStartRef.current.width;
    let newHeight = dragStartRef.current.height;

    // 根据不同的 handle 调整尺寸
    switch (activeHandle) {
      case 'se':
        newWidth = Math.min(Math.max(dragStartRef.current.width + deltaX, minWidth), maxWidth);
        newHeight = newWidth / aspectRatio;
        break;
      case 'sw':
        newWidth = Math.min(Math.max(dragStartRef.current.width - deltaX, minWidth), maxWidth);
        newHeight = newWidth / aspectRatio;
        break;
      case 'ne':
        newWidth = Math.min(Math.max(dragStartRef.current.width + deltaX, minWidth), maxWidth);
        newHeight = newWidth / aspectRatio;
        break;
      case 'nw':
        newWidth = Math.min(Math.max(dragStartRef.current.width - deltaX, minWidth), maxWidth);
        newHeight = newWidth / aspectRatio;
        break;
    }

    // 边界检查
    newWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
    newHeight = Math.min(Math.max(newHeight, minHeight), maxHeight);

    setSize({ width: newWidth, height: newHeight });
    onSizeChange?.(newWidth, newHeight);
  }, [isDragging, activeHandle, minWidth, minHeight, maxWidth, maxHeight, aspectRatio, onSizeChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setActiveHandle(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleSize = 8;
  const halfHandle = handleSize / 2;

  return (
    <div
      ref={imageRef}
      className="relative inline-block group"
      style={{ width: size.width, height: size.height }}
      onClick={onClick}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain cursor-pointer"
        draggable={false}
      />

      {/* 调整尺寸的手柄 */}
      <div
        className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          width: size.width,
          height: size.height,
          border: '2px dashed #3b82f6',
          pointerEvents: 'none',
        }}
      />

      {/* 四个角落的调整手柄 */}
      {(['nw', 'ne', 'sw', 'se'] as HandlePosition[]).map((handle) => {
        let style = {};
        switch (handle) {
          case 'nw':
            style = { top: -halfHandle, left: -halfHandle, cursor: 'nwse-resize' };
            break;
          case 'ne':
            style = { top: -halfHandle, right: -halfHandle, cursor: 'nesw-resize' };
            break;
          case 'sw':
            style = { bottom: -halfHandle, left: -halfHandle, cursor: 'nesw-resize' };
            break;
          case 'se':
            style = { bottom: -halfHandle, right: -halfHandle, cursor: 'nwse-resize' };
            break;
        }

        return (
          <div
            key={handle}
            className="absolute bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600"
            style={{
              ...style,
              width: handleSize,
              height: handleSize,
              pointerEvents: 'auto',
            }}
            onMouseDown={(e) => handleMouseDown(e, handle)}
          />
        );
      })}

      {/* 宽度和高度提示 */}
      <div
        className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      >
        {Math.round(size.width)} × {Math.round(size.height)}
      </div>
    </div>
  );
}
