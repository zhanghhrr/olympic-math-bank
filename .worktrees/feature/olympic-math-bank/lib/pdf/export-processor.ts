/**
 * PDF 导出任务处理器 — 异步执行 Puppeteer 渲染，仿教研云轮询模式。
 *
 * 流程：
 *   1. ExportJob 创建后调用 processExportJob(jobId)
 *   2. 更新状态为 PROCESSING
 *   3. 生成 HTML 模板 → Puppeteer 渲染 → 写入磁盘
 *   4. 更新状态为 COMPLETED（含 filePath、fileSize）
 *   5. 失败则更新为 FAILED（含 error 信息）
 */

import { prisma } from '@/lib/db/prisma';
import { buildExamHtml } from './html-template';
import { renderHtmlToPdf, generatePdfFileName, getExportDir } from './puppeteer-render';
import type { RenderBlock } from './html-template';
import path from 'path';

export async function processExportJob(jobId: string): Promise<void> {
  try {
    // 1. 标记为处理中
    const job = await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });

    if (!job.blocksJson) {
      throw new Error('导出任务缺少 blocks 数据');
    }

    const blocks = JSON.parse(job.blocksJson) as RenderBlock[];
    const mode = (job.mode as 'student' | 'teacher') || 'student';

    // 2. 生成 HTML
    const html = buildExamHtml({ blocks, mode });

    // 3. Puppeteer 渲染 PDF
    const fileName = generatePdfFileName();
    const outputPath = path.join(getExportDir(), fileName);

    const { fileSize } = await renderHtmlToPdf({
      html,
      outputPath: fileName,
    });

    // 4. 更新为完成
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        filePath: outputPath,
        fileSize,
        completedAt: new Date(),
      },
    });
  } catch (error: any) {
    console.error(`[ExportJob ${jobId}] 处理失败:`, error);
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: error?.message || '未知错误',
        completedAt: new Date(),
      },
    });
  }
}
