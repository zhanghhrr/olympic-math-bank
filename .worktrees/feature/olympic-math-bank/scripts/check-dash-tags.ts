import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找所有带横线的标签
  const tags = await prisma.knowledgeTag.findMany({
    where: {
      OR: [
        { name: { contains: '-' } }
      ]
    }
  });

  console.log('所有带横线的标签：');
  for (const tag of tags) {
    console.log(`Level ${tag.level}: "${tag.name}" (parentId: ${tag.parentId || 'null'})`);
    console.log(`  code: ${tag.code}`);
    console.log(`  module: ${tag.module}, topic: ${tag.topic}`);
    console.log(`  subtopic: ${tag.subtopic}, knowledge: ${tag.knowledge}`);
    console.log();
  }
}

check().finally(() => prisma.$disconnect());
