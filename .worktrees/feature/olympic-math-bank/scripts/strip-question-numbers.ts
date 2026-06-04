/**
 * 批量去除已有题目的题号
 * 运行方式: npx tsx scripts/strip-question-numbers.ts
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
 * 去除题干开头的题号
 */
function stripQuestionNumber(content: string): string {
  if (!content) return content;
  const pattern = /^\s*(\d+[\.、．]|第\s*\d+\s*题|[一二三四五六七八九十]+[、，,]|[\(（]\s*\d+\s*[\)）]|[\[【]?\d+[\]】]?|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|[ⅰⅱⅲⅳⅴ]+[.、])\s*/;
  return content.replace(pattern, '');
}

async function main() {
  console.log('开始去除题目题号...\n');

  // 获取所有题目
  const questions = await prisma.question.findMany({
    select: {
      id: true,
      content: true,
    }
  });

  console.log(`共找到 ${questions.length} 道题目\n`);

  let updated = 0;
  let skipped = 0;

  for (const question of questions) {
    const originalContent = question.content;
    const cleanedContent = stripQuestionNumber(originalContent);

    if (originalContent !== cleanedContent) {
      await prisma.question.update({
        where: { id: question.id },
        data: { content: cleanedContent }
      });
      updated++;
      console.log(`✓ [${question.id}] 更新成功`);
      console.log(`  原: ${originalContent.substring(0, 50)}...`);
      console.log(`  新: ${cleanedContent.substring(0, 50)}...\n`);
    } else {
      skipped++;
    }
  }

  console.log(`\n完成！共更新 ${updated} 道题目，跳过 ${skipped} 道题目`);
}

main()
  .catch((e) => {
    console.error('执行出错:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
