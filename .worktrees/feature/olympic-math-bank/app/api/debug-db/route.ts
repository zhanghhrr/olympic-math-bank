import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import path from 'path';

export async function GET() {
  // 获取实际的数据库URL
  const dbPath = process.env.DATABASE_URL || 'file:./lib/db/dev.db';
  let actualDbUrl = dbPath;
  if (dbPath.startsWith('file:')) {
    const dbFile = dbPath.slice(5);
    if (!path.isAbsolute(dbFile)) {
      actualDbUrl = 'file:' + path.resolve(process.cwd(), dbFile);
    }
  }

  const count = await prisma.knowledgeTag.count();
  const qktCount = await prisma.questionKnowledgeTag.count();
  const topTags = await prisma.knowledgeTag.findMany({
    where: { parentId: null },
    select: { id: true, name: true }
  });

  // 统计各顶级模块的关联数量
  const topModuleCounts: Record<string, number> = {};
  for (const tag of topTags) {
    const childIds = await prisma.knowledgeTag.findMany({
      where: { parentId: tag.id },
      select: { id: true }
    });
    const allIds = [tag.id, ...childIds.map(c => c.id)];

    const qktForModule = await prisma.questionKnowledgeTag.count({
      where: { knowledgeTagId: { in: allIds } }
    });
    topModuleCounts[tag.name] = qktForModule;
  }

  return NextResponse.json({
    count,
    qktCount,
    topTags: topTags.map(t => ({ id: t.id, name: t.name, idSlice: t.id.slice(0,8) })),
    databaseUrl: dbPath,
    actualDbUrl,
    topModuleQuestionCounts: topModuleCounts
  });
}
