'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * 通用翻页栏组件
 * 显示: 上一页 | 页码按钮(最多7个) | 下一页 | 总页数
 */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  // 生成要显示的页码数组（最多7个，包含省略号）
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [];

    // 始终显示第一页
    pages.push(1);

    if (page <= 3) {
      pages.push(2, 3, 4, 'ellipsis');
    } else if (page >= totalPages - 2) {
      pages.push('ellipsis', totalPages - 3, totalPages - 2, totalPages - 1);
    } else {
      pages.push('ellipsis', page - 1, page, page + 1, 'ellipsis');
    }

    // 始终显示最后一页
    pages.push(totalPages);

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className={cn('flex items-center justify-center gap-1', className)}>
      {/* 上一页 */}
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
          border border-border bg-surface text-foreground
          hover:bg-muted hover:border-muted-foreground/30
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:border-border"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">上一页</span>
      </button>

      {/* 页码按钮 */}
      <div className="flex items-center gap-1 mx-1">
        {pageNumbers.map((item, index) => {
          if (item === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${index}`}
                className="w-10 h-10 flex items-center justify-center text-sm text-muted-foreground"
              >
                ...
              </span>
            );
          }

          const isActive = item === page;
          return (
            <button
              key={item}
              onClick={() => onPageChange(item)}
              className={cn(
                'w-10 h-10 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {item}
            </button>
          );
        })}
      </div>

      {/* 下一页 */}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
          border border-border bg-surface text-foreground
          hover:bg-muted hover:border-muted-foreground/30
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:border-border"
      >
        <span className="hidden sm:inline">下一页</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
