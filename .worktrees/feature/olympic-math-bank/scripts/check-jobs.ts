import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkJobs() {
  const jobs = await prisma.importJob.findMany({
    include: { items: true, createdBy: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('=== 导入作业列表 ===\n');
  for (const job of jobs) {
    console.log(`作业ID: ${job.id}`);
    console.log(`文件名: ${job.fileName}`);
    console.log(`类型: ${job.type}`);
    console.log(`状态: ${job.status}`);
    console.log(`创建者: ${job.createdBy?.name || '未知'}`);
    console.log(`创建时间: ${job.createdAt}`);
    console.log(`项目数: ${job.totalItems}, 已处理: ${job.processedItems}`);
    console.log(`文件路径: ${job.fileUrl}`);
    console.log('---');
  }

  await prisma.$disconnect();
}

checkJobs().catch(console.error);
