import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// 获取知识标签列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level');
    const module = searchParams.get('module');
    const parentId = searchParams.get('parentId');

    const where: any = {};
    if (level) where.level = parseInt(level);
    if (module) where.module = module;
    if (parentId) where.parentId = parentId;

    const tags = await prisma.knowledgeTag.findMany({
      where,
      orderBy: [{ level: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        name: true,
        code: true,
        level: true,
        module: true,
        topic: true,
        subtopic: true,
        knowledge: true,
        skill: true,
        parentId: true,
        order: true,
        _count: {
          select: { questions: true }
        },
        children: {
          select: { id: true }
        }
      }
    });

    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Failed to fetch knowledge tags:', error);
    return NextResponse.json(
      { error: '获取知识标签失败' },
      { status: 500 }
    );
  }
}

// 获取所有模块列表
export async function POST(request: NextRequest) {
  try {
    const modules = await prisma.knowledgeTag.findMany({
      where: { level: 1 },
      orderBy: { order: 'asc' }
    });

    return NextResponse.json({ modules });
  } catch (error) {
    console.error('Failed to fetch modules:', error);
    return NextResponse.json(
      { error: '获取模块列表失败' },
      { status: 500 }
    );
  }
}
