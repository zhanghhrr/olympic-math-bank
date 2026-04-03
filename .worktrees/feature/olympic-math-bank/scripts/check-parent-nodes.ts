import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找这6个标签的parentId指向的节点
  const tagNames = ['直线型-杀留问题', '环形-杀留问题', '2-0  积分制', '2-1-0 积分制', '3-1-0 积分制', '杀留问题（猫捉老鼠）'];

  for (const name of tagNames) {
    const tag = await prisma.knowledgeTag.findFirst({ where: { name } });
    if (tag && tag.parentId) {
      const parent = await prisma.knowledgeTag.findUnique({ where: { id: tag.parentId } });
      console.log(`${name}:`);
      console.log(`  parentId: ${tag.parentId}`);
      console.log(`  父节点: ${parent?.name} (level ${parent?.level}, module: ${parent?.module})`);
      console.log();
    }
  }
}

check().finally(() => prisma.$disconnect());
