/**
 * POST /api/export/pdf/create
 *
 * 创建 PDF 导出任务（异步轮询模式，仿教研云方案）。
 * 接收 blocks 和 mode，创建 ExportJob 后立即返回 jobId，
 * 后台异步执行 Puppeteer 渲染。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { processExportJob } from '@/lib/pdf/export-processor';

interface ClientBlock {
  id: string;
  type: 'MAIN_TITLE' | 'SUB_TITLE' | 'QUESTION' | 'PAGE_BREAK';
  content?: string;
  question?: {
    id: string;
    content: string;
    answer?: string | null;
    solution?: string | null;
    type: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    // 鉴权
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { blocks, mode } = body as {
      blocks: ClientBlock[];
      mode: 'student' | 'teacher';
    };

    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json({ error: 'blocks 参数无效' }, { status: 400 });
    }

    // 统计题目数量
    const questionCount = blocks.filter((b) => b.type === 'QUESTION').length;

    // 只保留问题数据的核心字段，减小 JSON 体积
    const slimBlocks = blocks.map((b) => {
      if (b.type === 'QUESTION' && b.question) {
        return {
          id: b.id,
          type: b.type,
          question: {
            id: b.question.id,
            content: b.question.content,
            answer: b.question.answer,
            solution: b.question.solution,
            type: b.question.type,
          },
        };
      }
      return { id: b.id, type: b.type, content: b.content };
    });

    // 创建导出任务
    const job = await prisma.exportJob.create({
      data: {
        fileName: `exam_${new Date().toISOString().slice(0, 10)}.pdf`,
        mode: mode || 'student',
        questionCount,
        blocksJson: JSON.stringify(slimBlocks),
        // @ts-expect-error session.user.id 由 next-auth 扩展
        createdById: session.user.id,
      },
    });

    // 异步执行 PDF 生成（不阻塞响应）
    processExportJob(job.id).catch((err) => {
      console.error(`[ExportJob ${job.id}] 异步处理异常:`, err);
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error: any) {
    console.error('创建导出任务失败:', error);
    return NextResponse.json(
      { error: error?.message || '创建导出任务失败' },
      { status: 500 },
    );
  }
}
