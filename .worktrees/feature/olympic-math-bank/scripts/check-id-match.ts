import { prisma } from '../lib/db/prisma';

async function check() {
  const tag = await prisma.knowledgeTag.findFirst({ where: { name: '2-0  积分制' } });
  const parent = await prisma.knowledgeTag.findFirst({ where: { name: '体育比赛', level: 3 } });

  console.log('2-0  积分制 parentId:', tag?.parentId);
  console.log('体育比赛 id:', parent?.id);
  console.log('是否匹配:', tag?.parentId === parent?.id);

  if (tag?.parentId && parent?.id) {
    console.log('parentId长度:', tag.parentId.length);
    console.log('id长度:', parent.id.length);
    console.log('parentId:', JSON.stringify(tag.parentId));
    console.log('id:', JSON.stringify(parent.id));
  }
}

check().finally(() => prisma.$disconnect());
