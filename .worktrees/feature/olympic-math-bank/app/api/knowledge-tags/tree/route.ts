import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// 获取知识标签树形结构
export async function GET() {
  try {
    // 获取所有知识标签
    const allTags = await prisma.knowledgeTag.findMany({
      orderBy: [{ level: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        name: true,
        level: true,
        code: true,
        module: true,
        topic: true,
        subtopic: true,
        knowledge: true,
        skill: true,
        parentId: true,
      }
    });

    // 构建树形结构
    const tagMap = new Map<string, any>();
    const roots: any[] = [];

    // 先创建映射
    allTags.forEach(tag => {
      tagMap.set(tag.id, { ...tag, children: [] });
    });

    // 构建父子关系
    allTags.forEach(tag => {
      const node = tagMap.get(tag.id)!;
      if (tag.parentId && tagMap.has(tag.parentId)) {
        const parent = tagMap.get(tag.parentId)!;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return NextResponse.json({ tree: roots });
  } catch (error) {
    console.error('Failed to fetch knowledge tag tree:', error);
    return NextResponse.json(
      { error: '获取知识标签树失败' },
      { status: 500 }
    );
  }
}
