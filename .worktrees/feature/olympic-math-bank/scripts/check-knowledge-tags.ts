import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找杀留和积分相关的标签
  const tags = await prisma.knowledgeTag.findMany({
    where: {
      module: '组合模块',
      OR: [
        { knowledge: { contains: '杀留' } },
        { knowledge: { contains: '积分' } }
      ]
    },
    orderBy: { order: 'asc' }
  });
  
  console.log('数据库中组合模块下杀留/积分相关的标签：');
  tags.forEach(t => {
    console.log(`  Level ${t.level}: ${t.name} (code: ${t.code})`);
    console.log(`    二级: ${t.topic}, 三级: ${t.subtopic}, 四级: ${t.knowledge}`);
  });
  console.log(`共 ${tags.length} 个`);
}

check().finally(() => prisma.$disconnect());
