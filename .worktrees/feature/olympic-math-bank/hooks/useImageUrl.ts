import { useCallback } from 'react';

export function useImageUrl() {
  const getImageUrl = useCallback((path: string): string => {
    if (!path) return '';
    if (path.startsWith('http')) return path;

    // 如果是相对路径 images/xxx.jpg，转换为 API 路由
    if (path.startsWith('images/')) {
      return `/api/${path}`;
    }

    // 新格式: <baseName>/images/<filename> — OCR 导入时已嵌入唯一提取目录
    // 转换为 /api/images/<baseName>/<filename>
    const imageDirMatch = path.match(/^(.+?)\/images\/(.+)$/);
    if (imageDirMatch) {
      return `/api/images/${imageDirMatch[1]}/${imageDirMatch[2]}`;
    }

    // 其他相对路径
    const prefix = path.startsWith('/') ? '' : '/';
    return `${prefix}${path}`;
  }, []);

  return { getImageUrl };
}
