/**
 * 验证导入结果
 */

process.env.DATABASE_URL = 'file:./lib/db/dev.db';

import { prisma } from '../lib/db/prisma';

async function verifyImport() {
  console.log('[验证] 检查数据库中的题目...\n');

  const count = await prisma.question.count();
  console.log(`📊 总题目数: ${count}`);

  if (count === 0) {
    console.log('⚠️ 数据库中没有题目');
    return;
  }

  const questions = await prisma.question.findMany({
    take: 5,
    select: {
      id: true,
      content: true,
      answer: true,
      status: true,
      type: true,
      grade: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n📋 最新5道题目预览:\n');
  questions.forEach((q, i) => {
    console.log(`【题目 ${i + 1}】`);
    console.log(`ID: ${q.id}`);
    console.log(`状态: ${q.status}`);
    console.log(`类型: ${q.type}`);
    console.log(`年级: ${q.grade}`);
    console.log(`题干: ${q.content.substring(0, 100)}...`);
    console.log(`答案: ${q.answer.substring(0, 50)}...`);
    console.log('---\n');
  });

  const statusCount = await prisma.question.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  console.log('📈 按状态统计:');
  statusCount.forEach(s => {
    console.log(`  ${s.status}: ${s._count.status}`);
  });

  await prisma.$disconnect();
}

verifyImport().catch(console.error);
