import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找这6个标签
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

  console.log('6个标签的parentId和code：');
  for (const tag of tags) {
    console.log(`${tag.name}:`);
    console.log(`  parentId: ${tag.parentId}`);
    console.log(`  code: ${tag.code}`);
    console.log();
  }

  // 查找游戏策略和体育比赛的ID
  const gameStrategy = await prisma.knowledgeTag.findFirst({
    where: { name: '游戏策略', level: 3 }
  });
  const sports = await prisma.knowledgeTag.findFirst({
    where: { name: '体育比赛', level: 3 }
  });

  console.log('游戏策略 ID:', gameStrategy?.id);
  console.log('体育比赛 ID:', sports?.id);
}

check().finally(() => prisma.$disconnect());
