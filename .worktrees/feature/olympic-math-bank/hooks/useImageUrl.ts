import { useCallback } from 'react';

export function useImageUrl() {
  const getImageUrl = useCallback((path: string): string => {
    if (!path) return '';
    if (path.startsWith('http')) return path;

    // 如果是相对路径 images/xxx.jpg，转换为 API 路由
    if (path.startsWith('images/')) {
      return `/api/${path}`;
    }

    // 其他相对路径
    const prefix = path.startsWith('/') ? '' : '/';
    return `${prefix}${path}`;
  }, []);

  return { getImageUrl };
}
