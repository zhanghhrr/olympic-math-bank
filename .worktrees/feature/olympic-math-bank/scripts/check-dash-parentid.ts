import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找所有名字中包含横线的标签
  const dashTags = await prisma.knowledgeTag.findMany({
    where: {
      name: {
        contains: '-'
      }
    }
  });

  console.log('名字中包含横线的标签:');
  dashTags.forEach(t => {
    console.log(`  - "${t.name}"`);
    console.log(`    id: ${t.id}`);
    console.log(`    parentId: ${t.parentId}`);
    console.log(`    level: ${t.level}`);
    console.log('');
  });

  // 查找体育比赛
  const sports = await prisma.knowledgeTag.findFirst({
    where: { name: '体育比赛', level: 3 }
  });

  console.log('体育比赛 ID:', sports?.id);
  console.log('');

  // 检查积分制标签的parentId是否匹配体育比赛
  const scoreTags = dashTags.filter(t => t.name.includes('积分制'));
  console.log('积分制标签parentId检查:');
  scoreTags.forEach(t => {
    const matches = t.parentId === sports?.id;
    console.log(`  ${t.name}: parentId=${t.parentId}, 体育比赛ID=${sports?.id}, 匹配=${matches}`);
  });
}

check().finally(() => prisma.$disconnect());
