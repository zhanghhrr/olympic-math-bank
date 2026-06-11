import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { questionIds } = body as { questionIds: string[] };

    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json({ error: '缺少题目ID列表' }, { status: 400 });
    }

    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: {
        knowledgeTag: {
          include: {
            parent: {
              include: {
                parent: {
                  include: {
                    parent: {
                      include: { parent: true },
                    },
                  },
                },
              },
            },
          },
        },
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const exportData = questions.map(q => {
      const tagPath = (() => {
        if (!q.knowledgeTag) return '';
        const parts: string[] = [];
        let current: any = q.knowledgeTag;
        while (current) {
          parts.unshift(current.name);
          current = current.parent;
        }
        return parts.join(' > ');
      })();

      return {
        id: q.id,
        content: q.content,
        answer: q.answer,
        solution: q.solution,
        type: q.type,
        grade: q.grade,
        difficulty: q.difficulty,
        status: q.status,
        source: q.source,
        year: q.year,
        competition: q.competition,
        knowledgeTags: tagPath,
        formulas: q.formulas ? JSON.parse(q.formulas) : null,
        createdBy: q.createdBy?.name || '未知',
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      };
    });

    const jsonStr = JSON.stringify(exportData, null, 2);
    const date = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName = `题库导出_${exportData.length}题_${date}.json`;

    return new NextResponse(jsonStr, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('[Export JSON] 错误:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
