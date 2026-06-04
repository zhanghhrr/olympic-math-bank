/**
 * 查看题目的知识标签详情
 * 运行方式: npx tsx scripts/check-question-tags.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./lib/db/test.db'
    }
  }
});

function getTagPath(tag: any): string {
  const parts: string[] = [];
  if (tag.parent?.parent?.parent?.parent) parts.push(tag.parent.parent.parent.parent.name);
  if (tag.parent?.parent?.parent) parts.push(tag.parent.parent.parent.name);
  if (tag.parent?.parent) parts.push(tag.parent.parent.name);
  if (tag.parent) parts.push(tag.parent.name);
  parts.push(tag.name);
  return parts.join(' - ');
}

async function main() {
  // 获取有知识标签的题目
  const questions = await prisma.question.findMany({
    where: {
      knowledgeTags: {
        some: {}
      }
    },
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
    take: 10,
  });

  console.log(`共找到 ${questions.length} 道有标签的题目\n`);

  for (const q of questions) {
    console.log(`题目ID: ${q.id}`);
    console.log(`题干: ${q.content.substring(0, 50)}...`);
    console.log(`知识标签:`);
    for (const kt of q.knowledgeTags) {
      const tag = kt.knowledgeTag;
      console.log(`  - [${tag.id}] ${tag.name} (level: ${tag.level})`);
      console.log(`    完整路径: ${getTagPath(tag)}`);
    }
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error('执行出错:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
