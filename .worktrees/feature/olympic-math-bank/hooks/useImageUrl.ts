import { useCallback } from 'react';

export function useImageUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';

  const getImageUrl = useCallback((path: string): string => {
    if (!path) return '';
    if (path.startsWith('http')) return path;

    // 如果是相对路径 images/xxx.jpg，转换为 API 路由
    if (path.startsWith('images/')) {
      return `${baseUrl}/api/images/${path}`;
    }

    // 其他相对路径
    const prefix = path.startsWith('/') ? '' : '/';
    return `${baseUrl}${prefix}${path}`;
  }, [baseUrl]);

  return { getImageUrl };
}
