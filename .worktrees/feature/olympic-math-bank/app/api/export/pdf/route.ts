/**
 * POST /api/export/pdf (向后兼容)
 *
 * 已迁移至教研云方案（Puppeteer + 异步轮询）。
 * 此端点作为向后兼容层：内部使用新流程，但阻塞等待完成后直接返回 PDF。
 * 
 * 新代码请使用：
 *   POST /api/export/pdf/create → GET /api/export/pdf/status/:id → GET /api/export/pdf/download/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { processExportJob } from '@/lib/pdf/export-processor';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { blocks, mode } = body as {
      blocks: any[];
      mode: 'student' | 'teacher';
    };

    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json({ error: 'blocks 参数无效' }, { status: 400 });
    }

    const questionCount = blocks.filter((b) => b.type === 'QUESTION').length;

    // 创建 ExportJob
    const job = await prisma.exportJob.create({
      data: {
        fileName: `exam_${new Date().toISOString().slice(0, 10)}.pdf`,
        mode: mode || 'student',
        questionCount,
        blocksJson: JSON.stringify(blocks),
        // @ts-expect-error session.user.id
        createdById: session.user.id,
      },
    });

    // 同步等待 PDF 生成完成（阻塞模式，向后兼容）
    await processExportJob(job.id);

    // 重新查询最终状态
    const completedJob = await prisma.exportJob.findUnique({
      where: { id: job.id },
    });

    if (!completedJob || completedJob.status !== 'COMPLETED' || !completedJob.filePath) {
      const errorMsg = completedJob?.error || 'PDF 生成失败';
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    if (!fs.existsSync(completedJob.filePath)) {
      return NextResponse.json({ error: 'PDF 文件丢失' }, { status: 500 });
    }

    const buffer = fs.readFileSync(completedJob.filePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(completedJob.fileName)}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error: any) {
    console.error('PDF 生成失败:', error);
    return NextResponse.json(
      { error: error?.message || 'PDF 生成失败' },
      { status: 500 },
    );
  }
}
