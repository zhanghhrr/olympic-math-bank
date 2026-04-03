import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找杀留和积分相关的标签
  const tags = await prisma.knowledgeTag.findMany({
    where: {
      module: '组合模块',
      OR: [
        { knowledge: { contains: '杀留' } },
        { knowledge: { contains: '积分' } }
      ]
    },
    orderBy: { order: 'asc' }
  });

  console.log('检查parentId关联：');
  for (const tag of tags) {
    const parent = tag.parentId ? await prisma.knowledgeTag.findUnique({
      where: { id: tag.parentId }
    }) : null;

    console.log(`\n四级: ${tag.name}`);
    console.log(`  parentId: ${tag.parentId}`);
    console.log(`  父节点: ${parent ? parent.name + ' (level ' + parent.level + ')' : 'null'}`);
    console.log(`  期望父节点: ${tag.subtopic} (三级)`);
    const isCorrect = parent && parent.level === 3 && parent.name === tag.subtopic;
    console.log(`  parent是否正确: ${isCorrect ? '✓' : '✗'}`);
  }
}

check().finally(() => prisma.$disconnect());
