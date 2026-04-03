import { prisma } from '../lib/db/prisma';

async function listModules() {
  const modules = await prisma.knowledgeTag.findMany({
    where: { level: 1 },
    orderBy: { order: 'asc' }
  });

  console.log('所有模块:');
  modules.forEach(m => {
    console.log(`  - ${m.name} (code: ${m.code})`);
  });

  // 查找体育比赛在哪个模块下
  const sports = await prisma.knowledgeTag.findFirst({
    where: { name: '体育比赛' }
  });

  if (sports) {
    console.log('\n体育比赛所在模块:');
    console.log(`  module: ${sports.module}`);
    console.log(`  topic: ${sports.topic}`);
    console.log(`  subtopic: ${sports.subtopic}`);
  }
}

listModules().finally(() => prisma.$disconnect());
