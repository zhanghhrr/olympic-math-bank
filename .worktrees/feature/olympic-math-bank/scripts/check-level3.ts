import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找游戏策略和体育比赛
  const gameStrategy = await prisma.knowledgeTag.findFirst({
    where: { name: '游戏策略', level: 3 }
  });
  const sports = await prisma.knowledgeTag.findFirst({
    where: { name: '体育比赛', level: 3 }
  });

  console.log('游戏策略:');
  console.log('  id:', gameStrategy?.id);
  console.log('  parentId:', gameStrategy?.parentId);
  console.log('  code:', gameStrategy?.code);

  console.log('\n体育比赛:');
  console.log('  id:', sports?.id);
  console.log('  parentId:', sports?.parentId);
  console.log('  code:', sports?.code);

  // 查找它们的父节点
  if (gameStrategy?.parentId) {
    const parent = await prisma.knowledgeTag.findUnique({
      where: { id: gameStrategy.parentId }
    });
    console.log('\n游戏策略的父节点:', parent?.name, '(level', parent?.level + ')');
  }

  if (sports?.parentId) {
    const parent = await prisma.knowledgeTag.findUnique({
      where: { id: sports.parentId }
    });
    console.log('体育比赛的父节点:', parent?.name, '(level', parent?.level + ')');
  }
}

check().finally(() => prisma.$disconnect());
