'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { GripVertical } from 'lucide-react';

interface EditableImageProps {
  src: string;
  alt?: string;
  initialWidth?: number;
}

export function EditableImage({ src, alt = '', initialWidth = 200 }: EditableImageProps) {
  const [width, setWidth] = useState(initialWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(100, Math.min(800, startWidthRef.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className="relative inline-block group"
      style={{ width, maxWidth: '100%' }}
    >
      <div
        className={`absolute left-0 top-0 bottom-0 w-6 cursor-ew-resize flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors ${
          isDragging ? 'bg-gray-200' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>
      <div className="pl-6">
        <img
          src={src}
          alt={alt}
          style={{ width: '100%', height: 'auto' }}
          className="block border border-gray-200 rounded"
          draggable={false}
        />
      </div>
      <div className="absolute bottom-0 right-0 bg-black/50 text-white text-xs px-2 py-1 rounded-tl">
        {width}px
      </div>
    </div>
  );
}
