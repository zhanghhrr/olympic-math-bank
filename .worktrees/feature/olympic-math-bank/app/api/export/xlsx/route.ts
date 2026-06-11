import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import ExcelJS from 'exceljs';

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

    const typeLabels: Record<string, string> = {
      FILL_BLANK: '填空题', CHOICE: '选择题', SOLUTION: '解答题', CALCULATION: '计算题',
    };

    const gradeLabels: Record<string, string> = {
      P1: '一年级', P2: '二年级', P3: '三年级', P4: '四年级', P5: '五年级', P6: '六年级',
    };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('题库导出');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 25 },
      { header: '题干', key: 'content', width: 50 },
      { header: '答案', key: 'answer', width: 30 },
      { header: '解析', key: 'solution', width: 40 },
      { header: '题型', key: 'type', width: 10 },
      { header: '年级', key: 'grade', width: 8 },
      { header: '难度', key: 'difficulty', width: 10 },
      { header: '状态', key: 'status', width: 8 },
      { header: '来源', key: 'source', width: 20 },
      { header: '年份', key: 'year', width: 8 },
      { header: '竞赛', key: 'competition', width: 15 },
      { header: '知识标签', key: 'tagPath', width: 40 },
      { header: '创建者', key: 'creator', width: 10 },
      { header: '创建时间', key: 'createdAt', width: 20 },
    ];

    // 设置表头样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8D5C4' },
    };

    for (const q of questions) {
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

      worksheet.addRow({
        id: q.id,
        content: q.content,
        answer: q.answer,
        solution: q.solution || '',
        type: typeLabels[q.type] || q.type,
        grade: gradeLabels[q.grade] || q.grade,
        difficulty: '★'.repeat(q.difficulty),
        status: q.status === 'APPROVED' ? '已审核' : q.status === 'PENDING' ? '待审核' : q.status === 'DRAFT' ? '草稿' : '已拒绝',
        source: q.source || '',
        year: q.year ? String(q.year) : '',
        competition: q.competition || '',
        tagPath,
        creator: q.createdBy?.name || '',
        createdAt: q.createdAt.toLocaleString('zh-CN'),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
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
