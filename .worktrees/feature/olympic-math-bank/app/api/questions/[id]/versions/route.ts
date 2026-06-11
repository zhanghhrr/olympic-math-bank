import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const { id } = await params;

  const versions = await prisma.questionVersion.findMany({
    where: { questionId: id },
    include: {
      createdBy: { select: { name: true, phone: true } },
    },
    orderBy: { version: 'desc' },
  });

  return NextResponse.json({ versions });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { versionId } = body as { versionId: string };

  if (!versionId) {
    return NextResponse.json({ error: '缺少 versionId' }, { status: 400 });
  }

  const targetVersion = await prisma.questionVersion.findUnique({
    where: { id: versionId },
  });

  if (!targetVersion || targetVersion.questionId !== id) {
    return NextResponse.json({ error: '版本不存在' }, { status: 404 });
  }

  // 先保存当前状态为新版本
  const currentQ = await prisma.question.findUnique({
    where: { id },
    select: { content: true, answer: true, solution: true, options: true, formulas: true, sourceBlocks: true },
  });

  if (currentQ) {
    const latestVersion = await prisma.questionVersion.findFirst({
      where: { questionId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    await prisma.questionVersion.create({
      data: {
        questionId: id,
        version: nextVersion,
        content: currentQ.content,
        answer: currentQ.answer,
        solution: currentQ.solution,
        options: currentQ.options,
        formulas: currentQ.formulas,
        sourceBlocks: currentQ.sourceBlocks,
        changeLog: `回滚到版本 v${targetVersion.version}`,
        createdById: (session.user as any)?.id || 'default',
      },
    });
  }

  // 回滚到目标版本
  await prisma.question.update({
    where: { id },
    data: {
      content: targetVersion.content,
      answer: targetVersion.answer,
      solution: targetVersion.solution,
      options: targetVersion.options,
      formulas: targetVersion.formulas,
      sourceBlocks: targetVersion.sourceBlocks,
    },
  });

  return NextResponse.json({ success: true, message: `已回滚到版本 v${targetVersion.version}` });
}
