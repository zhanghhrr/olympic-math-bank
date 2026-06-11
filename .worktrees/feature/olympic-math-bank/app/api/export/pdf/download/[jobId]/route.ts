/**
 * GET /api/export/pdf/download/[jobId]
 *
 * 下载已生成的 PDF 文件。
 * 仅当 ExportJob.status === 'COMPLETED' 且 filePath 有效时可用。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import fs from 'fs';
import path from 'path';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { jobId } = await params;

    const job = await prisma.exportJob.findUnique({
      where: { id: jobId },
      select: { status: true, filePath: true, fileName: true },
    });

    if (!job) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    if (job.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: `PDF 尚未生成完毕，当前状态: ${job.status}` },
        { status: 400 },
      );
    }

    if (!job.filePath) {
      return NextResponse.json({ error: 'PDF 文件路径丢失' }, { status: 500 });
    }

    // 检查文件是否存在
    if (!fs.existsSync(job.filePath)) {
      return NextResponse.json({ error: 'PDF 文件已被清理，请重新生成' }, { status: 404 });
    }

    const buffer = fs.readFileSync(job.filePath);
    const fileName = job.fileName || path.basename(job.filePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error: any) {
    console.error('下载 PDF 失败:', error);
    return NextResponse.json(
      { error: error?.message || '下载失败' },
      { status: 500 },
    );
  }
}
