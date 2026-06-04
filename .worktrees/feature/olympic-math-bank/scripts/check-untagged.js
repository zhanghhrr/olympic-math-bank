const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:./lib/db/test.db' } } });

async function main() {
  const questionsWithoutTags = await prisma.question.findMany({
    where: { knowledgeTags: { none: {} } },
    select: { id: true, content: true },
    take: 20
  });

  console.log('无标签题目内容:\n');
  questionsWithoutTags.forEach((q, i) => {
    // 去掉Markdown标题
    const cleanContent = q.content.replace(/^#+ \d+\.\s*/, '').substring(0, 100);
    console.log(`${i + 1}. ${cleanContent}...`);
  });
}
main().finally(() => prisma.$disconnect());
