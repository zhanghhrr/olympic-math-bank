import { useCallback } from 'react';

export function useImageUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';

  const getImageUrl = useCallback((path: string): string => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const prefix = path.startsWith('/') ? '' : '/';
    return `${baseUrl}${prefix}${path}`;
  }, [baseUrl]);

  return { getImageUrl };
}
