import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找游戏策略和体育比赛的所有子节点
  const gameStrategy = await prisma.knowledgeTag.findFirst({
    where: { name: '游戏策略', level: 3 }
  });

  const sports = await prisma.knowledgeTag.findFirst({
    where: { name: '体育比赛', level: 3 }
  });

  console.log('游戏策略 ID:', gameStrategy?.id);
  console.log('体育比赛 ID:', sports?.id);

  if (gameStrategy) {
    const children = await prisma.knowledgeTag.findMany({
      where: { parentId: gameStrategy.id }
    });
    console.log('\n游戏策略的子节点：');
    children.forEach(c => console.log('  -', c.name, '(level', c.level + ')'));
  }

  if (sports) {
    const children = await prisma.knowledgeTag.findMany({
      where: { parentId: sports.id }
    });
    console.log('\n体育比赛的子节点：');
    children.forEach(c => console.log('  -', c.name, '(level', c.level + ')'));
  }
}

check().finally(() => prisma.$disconnect());
