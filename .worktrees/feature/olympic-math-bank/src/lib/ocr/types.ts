export interface OCROptions {
  language?: string;
  enhanceImage?: boolean;
  detectTables?: boolean;
}

export interface OCRResult {
  text: string;
  confidence: number;
  structured?: {
    title?: string;
    content?: string;
    answer?: string;
    analysis?: string;
  };
}

export interface OCRProgress {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: OCRResult;
  error?: string;
}
