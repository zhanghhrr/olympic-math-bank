import { PrismaClient } from '@prisma/client';

// 使用正确的数据库路径
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./lib/db/test.db'
    }
  }
});

async function check() {
  const count = await prisma.knowledgeTag.count();
  console.log('test.db 中的标签数:', count);

  // 查找体育比赛
  const sports = await prisma.knowledgeTag.findFirst({
    where: { name: '体育比赛', level: 3 }
  });
  console.log('\n体育比赛:', sports);

  // 查找积分制标签
  const scoreTags = await prisma.knowledgeTag.findMany({
    where: { name: { contains: '积分制' } }
  });
  console.log('\n积分制标签:', scoreTags);

  await prisma.$disconnect();
}

check();
