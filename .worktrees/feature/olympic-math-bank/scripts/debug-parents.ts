import { prisma } from '../lib/db/prisma';

async function check() {
  // 直接查找这6个标签
  const tags = await prisma.knowledgeTag.findMany({
    where: {
      OR: [
        { name: '直线型-杀留问题' },
        { name: '环形-杀留问题' },
        { name: '2-0  积分制' },
        { name: '2-1-0 积分制' },
        { name: '3-1-0 积分制' },
        { name: '杀留问题（猫捉老鼠）' }
      ]
    }
  });

  console.log('6个标签的parentId：');
  for (const tag of tags) {
    console.log(`${tag.name}: parentId=${tag.parentId}`);
  }

  // 查找所有可能的游戏策略节点
  const gameNodes = await prisma.knowledgeTag.findMany({
    where: { name: '游戏策略' }
  });
  console.log('\n所有游戏策略节点：');
  for (const n of gameNodes) {
    console.log(`  ID: ${n.id}, level: ${n.level}, topic: ${n.topic}`);
  }

  // 查找所有可能的体育比赛节点
  const sportNodes = await prisma.knowledgeTag.findMany({
    where: { name: '体育比赛' }
  });
  console.log('\n所有体育比赛节点：');
  for (const n of sportNodes) {
    console.log(`  ID: ${n.id}, level: ${n.level}, topic: ${n.topic}`);
  }
}

check().finally(() => prisma.$disconnect());
