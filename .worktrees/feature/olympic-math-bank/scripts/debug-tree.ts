import { prisma } from '../lib/db/prisma';

async function debug() {
  // 获取所有标签
  const allTags = await prisma.knowledgeTag.findMany({
    orderBy: [{ level: 'asc' }, { order: 'asc' }],
  });

  console.log('总标签数:', allTags.length);

  // 查找体育比赛和它的子节点
  const sports = await prisma.knowledgeTag.findFirst({
    where: { name: '体育比赛', level: 3 }
  });

  console.log('\n体育比赛 ID:', sports?.id);

  // 查找所有parentId为体育比赛ID的标签
  const children = await prisma.knowledgeTag.findMany({
    where: { parentId: sports?.id }
  });

  console.log('体育比赛的子节点数:', children.length);
  children.forEach(c => console.log('  -', c.name));

  // 构建树并检查
  const tagMap = new Map<string, any>();
  const roots: any[] = [];

  allTags.forEach(tag => {
    tagMap.set(tag.id, { ...tag, children: [] });
  });

  console.log('\ntagMap size:', tagMap.size);
  console.log('tagMap has 体育比赛 ID:', tagMap.has(sports?.id || ''));

  allTags.forEach(tag => {
    const node = tagMap.get(tag.id)!;
    if (tag.parentId && tagMap.has(tag.parentId)) {
      const parent = tagMap.get(tag.parentId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // 查找体育比赛在树中的位置
  const sportsInTree = tagMap.get(sports?.id || '');
  console.log('\n体育比赛在树中的子节点数:', sportsInTree?.children?.length);
  sportsInTree?.children?.forEach((c: any) => console.log('  -', c.name));
}

debug().finally(() => prisma.$disconnect());
