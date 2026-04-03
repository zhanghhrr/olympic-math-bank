import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找所有名为"体育比赛"的标签
  const sportsTags = await prisma.knowledgeTag.findMany({
    where: { name: '体育比赛' }
  });

  console.log(`找到 ${sportsTags.length} 个名为"体育比赛"的标签:\n`);

  sportsTags.forEach((t, i) => {
    console.log(`[${i + 1}]`);
    console.log(`  id: ${t.id}`);
    console.log(`  name: ${t.name}`);
    console.log(`  level: ${t.level}`);
    console.log(`  module: ${t.module}`);
    console.log(`  topic: ${t.topic}`);
    console.log(`  subtopic: ${t.subtopic}`);
    console.log(`  parentId: ${t.parentId}`);
    console.log('');
  });

  // 检查组合模块下的体育比赛
  const comboSports = sportsTags.filter(t => t.module === '组合模块');
  console.log(`组合模块下有 ${comboSports.length} 个"体育比赛"标签`);

  // 查找这些体育比赛的子节点
  for (const sports of comboSports) {
    const children = await prisma.knowledgeTag.findMany({
      where: { parentId: sports.id }
    });
    console.log(`\n体育比赛 (${sports.id.slice(0, 8)}...) 的子节点:`);
    children.forEach(c => console.log(`  - ${c.name}`));
  }
}

check().finally(() => prisma.$disconnect());
