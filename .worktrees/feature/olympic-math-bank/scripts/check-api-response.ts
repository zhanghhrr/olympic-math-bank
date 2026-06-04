import { prisma } from '../lib/db/prisma';

async function check() {
  // 模拟API调用 - 获取"组合模块"下的所有标签
  const moduleName = '组合模块';

  const tags = await prisma.knowledgeTag.findMany({
    where: { module: moduleName },
    orderBy: [{ level: 'asc' }, { order: 'asc' }],
    include: {
      _count: {
        select: { questions: true }
      },
      children: {
        select: { id: true }
      }
    }
  });

  console.log(`模块 "${moduleName}" 下共有 ${tags.length} 个标签\n`);

  // 查找体育比赛
  const sports = tags.find(t => t.name === '体育比赛' && t.level === 3);
  console.log('体育比赛标签:', {
    id: sports?.id,
    name: sports?.name,
    level: sports?.level,
    parentId: sports?.parentId,
    children: sports?.children
  });

  // 查找积分制标签
  const scoreTags = tags.filter(t => t.name.includes('积分制'));
  console.log('\n积分制标签:');
  scoreTags.forEach(t => {
    console.log('  -', {
      name: t.name,
      id: t.id,
      parentId: t.parentId,
      children: t.children
    });
  });

  // 检查parentId是否匹配
  console.log('\n检查parentId匹配:');
  scoreTags.forEach(t => {
    const parentMatch = t.parentId === sports?.id;
    console.log(`  ${t.name}: parentId=${t.parentId?.slice(0,8)}..., 体育比赛ID=${sports?.id.slice(0,8)}..., 匹配=${parentMatch}`);
  });

  // 模拟前端buildTree
  const tagMap = new Map<string, any>();
  const roots: any[] = [];

  tags.forEach(tag => {
    tagMap.set(tag.id, { ...tag, children: [] });
  });

  tags.forEach(tag => {
    const node = tagMap.get(tag.id)!;
    if (tag.parentId && tagMap.has(tag.parentId)) {
      const parent = tagMap.get(tag.parentId)!;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // 检查体育比赛在树中的子节点
  const sportsInTree = tagMap.get(sports?.id || '');
  console.log('\n树中体育比赛的子节点:');
  sportsInTree?.children?.forEach((c: any) => {
    console.log('  -', c.name);
  });
}

check().finally(() => prisma.$disconnect());
