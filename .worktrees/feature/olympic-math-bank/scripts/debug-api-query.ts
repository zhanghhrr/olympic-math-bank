import { prisma } from '../lib/db/prisma';

async function debug() {
  // 模拟API查询
  const moduleName = '组合模块';

  const tags = await prisma.knowledgeTag.findMany({
    where: { module: moduleName },
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
    }
  });

  console.log(`模块 "${moduleName}" 返回 ${tags.length} 个标签\n`);

  // 查找所有名为"体育比赛"的标签
  const sportsTags = tags.filter(t => t.name === '体育比赛');
  console.log(`其中名为"体育比赛"的标签有 ${sportsTags.length} 个:`);
  sportsTags.forEach(t => {
    console.log(`  - ID: ${t.id}`);
    console.log(`    level: ${t.level}`);
    console.log(`    topic: ${t.topic}`);
    console.log(`    subtopic: ${t.subtopic}`);
    console.log(`    parentId: ${t.parentId}`);
    console.log('');
  });

  // 查找level=3的体育比赛
  const level3Sports = tags.find(t => t.name === '体育比赛' && t.level === 3);
  console.log('level=3的体育比赛:', level3Sports);

  // 检查积分制标签
  const scoreTags = tags.filter(t => t.name.includes('积分制'));
  console.log(`\n找到 ${scoreTags.length} 个积分制标签:`);
  scoreTags.forEach(t => {
    console.log(`  - "${t.name}"`);
    console.log(`    id: ${t.id}`);
    console.log(`    parentId: ${t.parentId}`);
    console.log(`    parentId匹配体育比赛: ${t.parentId === level3Sports?.id}`);
    console.log('');
  });
}

debug().finally(() => prisma.$disconnect());
