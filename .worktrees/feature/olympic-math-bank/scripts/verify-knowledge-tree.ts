import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function verify() {
  const total = await prisma.knowledgeTag.count();
  console.log('总标签数:', total);

  const modules = await prisma.knowledgeTag.findMany({
    where: { level: 1 },
    orderBy: { order: 'asc' }
  });
  console.log('\n一级模块:');
  modules.forEach(m => console.log('  -', m.name));

  // 显示计算模块下的二级专题
  const calcTopics = await prisma.knowledgeTag.findMany({
    where: {
      level: 2,
      module: '计算模块'
    },
    orderBy: { order: 'asc' },
    take: 10
  });
  console.log('\n计算模块下的二级专题(前10个):');
  calcTopics.forEach(t => console.log('  -', t.name));

  // 显示一个完整的五级路径示例
  const sample = await prisma.knowledgeTag.findFirst({
    where: { level: 5 }
  });
  if (sample) {
    console.log('\n五级知识点示例:');
    console.log('  模块:', sample.module);
    console.log('  专题:', sample.topic);
    console.log('  子专题:', sample.subtopic);
    console.log('  知识点:', sample.knowledge);
    console.log('  技能:', sample.skill);
    console.log('  Code:', sample.code);
  }

  await prisma.$disconnect();
}

verify();
