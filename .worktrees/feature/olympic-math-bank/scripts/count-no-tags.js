const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:./lib/db/test.db' } } });

async function main() {
  const total = await prisma.question.count();
  const withTags = await prisma.question.count({ where: { knowledgeTags: { some: {} } } });
  console.log('总题目数:', total);
  console.log('有标签的题目:', withTags);
  console.log('无标签的题目:', total - withTags);
}
main().finally(() => prisma.$disconnect());
