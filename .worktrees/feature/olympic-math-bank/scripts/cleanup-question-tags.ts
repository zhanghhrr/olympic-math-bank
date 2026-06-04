/**
 * 清理题目的知识标签，只保留展示路径中的标签
 * 运行方式: npx tsx scripts/cleanup-question-tags.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./lib/db/test.db'
    }
  }
});

/**
 * 获取标签及其所有父级标签的ID列表
 */
function getTagAndParentIds(tag: any): string[] {
  const ids: string[] = [tag.id];
  
  // 遍历父级层级获取所有祖先标签ID
  let current = tag;
  while (current.parent) {
    ids.push(current.parent.id);
    current = current.parent;
  }
  
  return ids;
}

async function main() {
  console.log('开始清理题目标签...\n');

  // 获取所有题目及其知识标签
  const questions = await prisma.question.findMany({
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
  });

  console.log(`共找到 ${questions.length} 道题目\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const question of questions) {
    if (question.knowledgeTags.length === 0) {
      skippedCount++;
      continue;
    }

    // 获取该题目所有标签及其父级标签的ID集合
    const validTagIds = new Set<string>();
    for (const qt of question.knowledgeTags) {
      const tagPathIds = getTagAndParentIds(qt.knowledgeTag);
      tagPathIds.forEach(id => validTagIds.add(id));
    }

    // 找出需要删除的关联
    const currentTagIds = new Set(question.knowledgeTags.map(qt => qt.knowledgeTagId));
    const tagsToDelete = question.knowledgeTags.filter(qt => !validTagIds.has(qt.knowledgeTagId));

    if (tagsToDelete.length > 0) {
      // 删除多余的标签关联
      for (const tag of tagsToDelete) {
        await prisma.questionKnowledgeTag.delete({
          where: { questionId_knowledgeTagId: { questionId: question.id, knowledgeTagId: tag.knowledgeTagId } }
        });
      }
      updatedCount++;
      console.log(`✓ [${question.id}] 更新成功，删除了 ${tagsToDelete.length} 个多余标签`);
    } else {
      skippedCount++;
    }
  }

  console.log(`\n完成！共更新 ${updatedCount} 道题目，跳过 ${skippedCount} 道题目`);
}

main()
  .catch((e) => {
    console.error('执行出错:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
