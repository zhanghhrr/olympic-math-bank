import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { renderQuestionsToMd, type QuestionWithTags } from '@/lib/export/md-generator';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { questionIds } = body as { questionIds?: string[] };

    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json(
        { error: 'questionIds 参数无效，需提供非空字符串数组' },
        { status: 400 },
      );
    }

    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: {
        knowledgeTag: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (questions.length === 0) {
      return NextResponse.json(
        { error: '未找到匹配的题目' },
        { status: 404 },
      );
    }

    const mdContent = renderQuestionsToMd(questions as unknown as QuestionWithTags[]);
    const encoder = new TextEncoder();
    const mdBytes = encoder.encode(mdContent);

    const fileName = `题库导出_${questions.length}题_${new Date().toISOString().slice(0, 10)}.md`;

    return new NextResponse(mdBytes, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': String(mdBytes.length),
      },
    });
  } catch (error) {
    console.error('MD 导出失败:', error);
    return NextResponse.json(
      { error: 'MD 导出失败' },
      { status: 500 },
    );
  }
}
