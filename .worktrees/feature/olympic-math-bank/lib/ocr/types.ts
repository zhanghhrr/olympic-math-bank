/**
 * OCR模块类型定义
 */

export interface OCRResult {
  text: string;
  confidence: number;
  structured?: {
    title?: string;
    content: string;
    answer?: string;
    analysis?: string;
  };
  error?: string;
}

export interface OCROptions {
  language?: string;
  outputFormat?: 'text' | 'json' | 'markdown';
  autoMatchTags?: boolean;
}

export interface OCRProgress {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: OCRResult;
  error?: string;
}

export interface OCRJob {
  id: string;
  fileName: string;
  status: OCRProgress['status'];
  progress: number;
  result?: OCRResult;
  error?: string;
  createdAt: Date;
}
