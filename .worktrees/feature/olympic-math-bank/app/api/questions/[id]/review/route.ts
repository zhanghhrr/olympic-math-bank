import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 仅审核员和管理员可执行审核操作
    const userRole = (session.user as any).role;
    if (userRole !== 'ADMIN' && userRole !== 'REVIEWER') {
      return NextResponse.json(
        { error: '无审核权限，仅审核员和管理员可审核题目' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { status, comment } = body;

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json(
        { error: '无效的审核状态' },
        { status: 400 }
      );
    }

    // 检查题目是否存在
    const question = await prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      return NextResponse.json(
        { error: '题目不存在' },
        { status: 404 }
      );
    }

    // 前置状态校验：只能审核 PENDING 状态的题目
    if (question.status !== 'PENDING') {
      return NextResponse.json(
        { error: '只能审核待审核状态的题目' },
        { status: 409 }
      );
    }

    // 更新题目状态
    const updatedQuestion = await prisma.question.update({
      where: { id },
      data: {
        status,
      },
    });

    // 创建审核记录
    await prisma.review.create({
      data: {
        questionId: id,
        reviewerId: (session.user as any).id as string,
        status,
        comment: comment || null,
      },
    });

    return NextResponse.json(updatedQuestion);
  } catch (error) {
    console.error('Failed to review question:', error);
    return NextResponse.json(
      { error: '审核失败' },
      { status: 500 }
    );
  }
}
