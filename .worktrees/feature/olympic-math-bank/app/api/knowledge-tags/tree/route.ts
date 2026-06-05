import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTagTree } from '@/lib/ocr/tagging';

// 获取知识标签树形结构（带内存缓存）
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 复用 tagging 模块的标签树内存缓存
    const allTags = await getTagTree();

    // 检查孤儿节点（parentId 指向不存在的标签）
    const existingIds = new Set(allTags.map((t: any) => t.id));
    for (const tag of allTags) {
      if (tag.parentId && !existingIds.has(tag.parentId)) {
        console.warn(`[KnowledgeTag] 孤儿标签: ${tag.name} (id=${tag.id}), parentId=${tag.parentId} 不存在`);
      }
    }
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
