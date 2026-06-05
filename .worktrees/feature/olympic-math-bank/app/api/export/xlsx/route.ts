import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
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
        knowledgeTags: {
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
          },
        },
        createdBy: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const typeLabels: Record<string, string> = {
      FILL_BLANK: '填空题', CHOICE: '选择题', SOLUTION: '解答题', CALCULATION: '计算题',
    };

    const gradeLabels: Record<string, string> = {
      P1: '一年级', P2: '二年级', P3: '三年级', P4: '四年级', P5: '五年级', P6: '六年级',
    };

    const rows = questions.map(q => {
      const tagPaths = q.knowledgeTags.map(kt => {
        const tag = kt.knowledgeTag;
        const parts: string[] = [];
        let current: any = tag;
        while (current) {
          parts.unshift(current.name);
          current = current.parent;
        }
        return parts.join(' > ');
      }).join('; ');

      return {
        'ID': q.id,
        '题干': q.content,
        '答案': q.answer,
        '解析': q.solution || '',
        '题型': typeLabels[q.type] || q.type,
        '年级': gradeLabels[q.grade] || q.grade,
        '难度': '★'.repeat(q.difficulty),
        '状态': q.status === 'APPROVED' ? '已审核' : q.status === 'PENDING' ? '待审核' : q.status === 'DRAFT' ? '草稿' : '已拒绝',
        '来源': q.source || '',
        '年份': q.year ? String(q.year) : '',
        '竞赛': q.competition || '',
        '知识标签': tagPaths,
        '创建者': q.createdBy?.name || '',
        '创建时间': q.createdAt.toLocaleString('zh-CN'),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ['ID', '题干', '答案', '解析', '题型', '年级', '难度', '状态', '来源', '年份', '竞赛', '知识标签', '创建者', '创建时间'],
    });

    // 设置列宽
    const colWidths = [
      { wch: 25 }, { wch: 50 }, { wch: 30 }, { wch: 40 }, { wch: 10 },
      { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 8 },
      { wch: 15 }, { wch: 40 }, { wch: 10 }, { wch: 20 },
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '题库导出');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const date = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName = `题库导出_${questions.length}题_${date}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('[Export XLSX] 错误:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
