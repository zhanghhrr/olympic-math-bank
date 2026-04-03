const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:./lib/db/test.db' } } });

async function main() {
  // 获取一些有标签的题目及其标签完整路径
  const questions = await prisma.question.findMany({
    where: { knowledgeTags: { some: {} } },
    include: {
      knowledgeTags: {
        include: {
          knowledgeTag: {
            include: {
              parent: {
                include: {
                  parent: {
                    include: {
                      parent: {
                        include: {
                          parent: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    take: 20
  });

  console.log('题目及其标签路径:\n');
  for (const q of questions) {
    console.log(`题目: ${q.content.substring(0, 50)}...`);
    for (const kt of q.knowledgeTags) {
      const tag = kt.knowledgeTag;
      const path = [
        tag.parent?.parent?.parent?.parent?.name,
        tag.parent?.parent?.parent?.name,
        tag.parent?.parent?.name,
        tag.parent?.name,
        tag.name
      ].filter(Boolean).join(' - ');
      console.log(`  标签: ${path}`);
    }
    console.log('');
  }
}
main().finally(() => prisma.$disconnect());
