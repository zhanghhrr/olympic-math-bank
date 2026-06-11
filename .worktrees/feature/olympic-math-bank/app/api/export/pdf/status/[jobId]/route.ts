/**
 * GET /api/export/pdf/status/[jobId]
 *
 * 轮询 PDF 导出任务状态（仿教研云方案）。
 * 返回 { status, downloadUrl?, error? }。
 * 前端每 1 秒轮询直到 status === 'COMPLETED'。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { jobId } = await params;

    const job = await prisma.exportJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        filePath: true,
        fileSize: true,
        error: true,
        createdAt: true,
        completedAt: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    // 构建下载 URL（仅 COMPLETED 时）
    const downloadUrl =
      job.status === 'COMPLETED' && job.filePath
        ? `/api/export/pdf/download/${job.id}`
        : undefined;

    return NextResponse.json({
      status: job.status,
      downloadUrl,
      fileSize: job.fileSize,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (error: any) {
    console.error('查询导出任务状态失败:', error);
    return NextResponse.json(
      { error: error?.message || '查询失败' },
      { status: 500 },
    );
  }
}
