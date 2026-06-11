import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const [
      totalQuestions,
      byStatus,
      byGrade,
      byType,
      byDifficulty,
      topTags,
      importTrend,
      reviewStats,
    ] = await Promise.all([
      prisma.question.count(),

      prisma.question.groupBy({
        by: ['status'],
        _count: true,
      }),

      prisma.question.groupBy({
        by: ['grade'],
        _count: true,
        orderBy: { _count: { grade: 'asc' } },
      }),

      prisma.question.groupBy({
        by: ['type'],
        _count: true,
      }),

      prisma.question.groupBy({
        by: ['difficulty'],
        _count: true,
        orderBy: { difficulty: 'asc' },
      }),

      prisma.question.findMany({
        select: {
          knowledgeTag: {
            select: { id: true, name: true, module: true, topic: true },
          },
        },
        where: { knowledgeTagId: { not: null } },
      }).then(rows => {
        const countMap = new Map<string, { id: string; name: string; module: string | null; count: number }>();
        for (const row of rows) {
          if (!row.knowledgeTag) continue;
          const tag = row.knowledgeTag;
          if (!countMap.has(tag.id)) {
            countMap.set(tag.id, { id: tag.id, name: tag.name, module: tag.module, count: 0 });
          }
          countMap.get(tag.id)!.count++;
        }
        return Array.from(countMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 20);
      }),

      prisma.importJob.findMany({
        select: {
          createdAt: true,
          status: true,
          totalItems: true,
          type: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

      prisma.review.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    const formatKeyValue = (list: Array<Record<string, any>>, keyField: string) => {
      const map: Record<string, number> = {};
      for (const item of list) {
        const key = item[keyField]?.toString() || '未知';
        map[key] = item._count;
      }
      return map;
    };

    const tagsTotal = topTags.reduce((s, t) => s + t.count, 0);
    const totalTags = await prisma.knowledgeTag.count();

    return NextResponse.json({
      overview: {
        totalQuestions,
        pending: formatKeyValue(byStatus, 'status')['PENDING'] || 0,
        approved: formatKeyValue(byStatus, 'status')['APPROVED'] || 0,
        draft: formatKeyValue(byStatus, 'status')['DRAFT'] || 0,
        rejected: formatKeyValue(byStatus, 'status')['REJECTED'] || 0,
      },
      byGrade: formatKeyValue(byGrade, 'grade'),
      byType: formatKeyValue(byType, 'type'),
      byDifficulty: formatKeyValue(byDifficulty, 'difficulty'),
      tagCoverage: {
        total: totalTags,
        used: topTags.length,
        rate: totalTags > 0 ? Math.round((topTags.length / totalTags) * 100) : 0,
        topTags,
      },
      importTrend: importTrend.map(j => ({
        date: j.createdAt.toISOString().substring(0, 10),
        status: j.status,
        items: j.totalItems,
        type: j.type,
      })),
      reviewStats: formatKeyValue(reviewStats, 'status'),
    });
  } catch (error) {
    console.error('[Stats API] 错误:', error);
    return NextResponse.json({ error: '获取统计数据失败' }, { status: 500 });
  }
}
