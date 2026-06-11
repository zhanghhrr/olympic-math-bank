import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

function escapeCsvField(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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
        createdBy: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const headers = ['ID', '题干', '答案', '解析', '题型', '年级', '难度', '状态', '来源', '年份', '竞赛', '知识标签', '创建者', '创建时间'];
    const rows = questions.map(q => {
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

      const typeLabels: Record<string, string> = {
        FILL_BLANK: '填空题', CHOICE: '选择题', SOLUTION: '解答题',
        CALCULATION: '计算题', SINGLE_CHOICE: '单选题', MULTI_CHOICE: '多选题', PROOF: '证明题',
      };

      return [
        q.id,
        q.content,
        q.answer,
        q.solution || '',
        typeLabels[q.type] || q.type,
        q.grade,
        String(q.difficulty),
        q.status,
        q.source || '',
        q.year ? String(q.year) : '',
        q.competition || '',
        tagPath,
        q.createdBy?.name || '',
        q.createdAt.toISOString(),
      ].map(escapeCsvField).join(',');
    });

    const bom = '\uFEFF';
    const csvContent = bom + [headers.join(','), ...rows].join('\n');
    const date = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName = `题库导出_${questions.length}题_${date}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('[Export CSV] 错误:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
