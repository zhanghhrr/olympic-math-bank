import { Skill } from '@/types/skill';
import { OCRResult, OCROptions, OCRProgress } from './types';
import { PROMPT_TEMPLATES } from './config';

export class OCRProcessor {
  private skill: Skill;

  constructor() {
    this.skill = new Skill('ocr-document-processor');
  }

  async processFile(
    filePath: string,
    options: OCROptions = {},
    onProgress?: (progress: OCRProgress) => void
  ): Promise<OCRResult> {
    try {
      onProgress?.({
        status: 'processing',
        progress: 10,
        message: '正在初始化OCR引擎...',
      });

      const result = await this.skill.execute({
        file: filePath,
        language: options.language || 'chi_sim+eng',
        prompt: PROMPT_TEMPLATES.mathProblem,
        outputFormat: 'json',
      });

      onProgress?.({
        status: 'processing',
        progress: 80,
        message: '正在解析结果...',
      });

      const parsedResult = this.parseResult(result);

      onProgress?.({
        status: 'completed',
        progress: 100,
        message: '处理完成',
        result: parsedResult,
      });

      return parsedResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OCR处理失败';
      onProgress?.({
        status: 'failed',
        progress: 0,
        message: errorMessage,
        error: errorMessage,
      });
      throw error;
    }
  }

  private parseResult(result: any): OCRResult {
    try {
      if (typeof result === 'string') {
        result = JSON.parse(result);
      }

      return {
        text: result.content || result.text || '',
        confidence: result.confidence || 0.85,
        structured: {
          title: result.title || '',
          content: result.content || result.text || '',
          answer: result.answer || '',
          analysis: result.analysis || '',
        },
      };
    } catch {
      return {
        text: String(result),
        confidence: 0.5,
      };
    }
  }
}

export const ocrProcessor = new OCRProcessor();
