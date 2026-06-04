import { prisma } from '../lib/db/prisma';

async function check() {
  // 总标签数
  const totalTags = await prisma.knowledgeTag.count();
  console.log(`数据库总标签数: ${totalTags}\n`);

  // 按模块统计
  const moduleStats = await prisma.knowledgeTag.groupBy({
    by: ['module'],
    _count: { id: true }
  });
  console.log('按模块统计:');
  moduleStats.forEach(m => {
    console.log(`  - ${m.module}: ${m._count.id} 个标签`);
  });

  // 查找所有名为"体育比赛"的标签
  const sportsTags = await prisma.knowledgeTag.findMany({
    where: { name: '体育比赛' }
  });
  console.log(`\n找到 ${sportsTags.length} 个名为"体育比赛"的标签:`);
  sportsTags.forEach((t, i) => {
    console.log(`\n[${i + 1}] ID: ${t.id}`);
    console.log(`    module: ${t.module}`);
    console.log(`    level: ${t.level}`);
    console.log(`    code: ${t.code}`);

    // 查找其子节点
    prisma.knowledgeTag.findMany({
      where: { parentId: t.id }
    }).then(children => {
      console.log(`    子节点数: ${children.length}`);
      children.forEach(c => console.log(`      - ${c.name}`));
    });
  });

  // 查找所有积分制标签
  const scoreTags = await prisma.knowledgeTag.findMany({
    where: { name: { contains: '积分制' } }
  });
  console.log(`\n\n找到 ${scoreTags.length} 个积分制标签:`);
  scoreTags.forEach((t, i) => {
    console.log(`\n[${i + 1}] "${t.name}"`);
    console.log(`    ID: ${t.id}`);
    console.log(`    parentId: ${t.parentId}`);
    console.log(`    module: ${t.module}`);
    console.log(`    code: ${t.code}`);
  });
}

check().finally(() => prisma.$disconnect());
