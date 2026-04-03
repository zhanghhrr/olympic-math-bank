/**
 * OCR处理器 - 使用MinerU Web API识别PDF
 * 使用项目内部的 mineru-client 实现
 */

import { join } from 'path';
import { processPDF } from '@/lib/ocr/mineru-client';

export async function processPDFWithOCR(pdfPath: string, outputDir: string): Promise<string> {
  console.log(`🔄 开始OCR处理: ${pdfPath}`);

  try {
    // 创建临时工作目录
    const fs = await import('fs/promises');
    const workDir = join(outputDir, 'work');
    await fs.mkdir(workDir, { recursive: true });

    // 复制PDF到工作目录
    const pdfName = pdfPath.split('/').pop() || pdfPath.split('\\').pop() || 'input.pdf';
    const workPdfPath = join(workDir, pdfName);
    await fs.copyFile(pdfPath, workPdfPath);

    console.log(`📄 已复制PDF到工作目录: ${workPdfPath}`);

    // 使用项目内部的 MinerU 客户端进行OCR处理
    const result = await processPDF(workPdfPath, outputDir);

    if (!result.success) {
      throw new Error(result.error || 'OCR识别失败');
    }

    console.log(`✅ OCR处理完成，识别到 ${result.questions?.length || 0} 道题目`);

    return result.markdownContent || '';
  } catch (error) {
    console.error('OCR处理失败:', error);
    throw error;
  }
}
