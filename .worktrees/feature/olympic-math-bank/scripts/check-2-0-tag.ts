import { prisma } from '../lib/db/prisma';

async function check() {
  // 查找2-0 积分制
  const tag = await prisma.knowledgeTag.findFirst({
    where: { name: '2-0  积分制' }
  });

  console.log('2-0  积分制 的完整信息：');
  console.log('  id:', tag?.id);
  console.log('  name:', tag?.name);
  console.log('  level:', tag?.level);
  console.log('  code:', tag?.code);
  console.log('  parentId:', tag?.parentId);
  console.log('  module:', tag?.module);
  console.log('  topic:', tag?.topic);
  console.log('  subtopic:', tag?.subtopic);
  console.log('  knowledge:', tag?.knowledge);
  console.log('  skill:', tag?.skill);

  if (tag?.parentId) {
    const parent = await prisma.knowledgeTag.findUnique({
      where: { id: tag.parentId }
    });
    console.log('\n父节点信息：');
    console.log('  id:', parent?.id);
    console.log('  name:', parent?.name);
    console.log('  level:', parent?.level);
    console.log('  parentId:', parent?.parentId);
    console.log('  module:', parent?.module);

    if (parent?.parentId) {
      const grandparent = await prisma.knowledgeTag.findUnique({
        where: { id: parent.parentId }
      });
      console.log('\n祖父节点信息：');
      console.log('  id:', grandparent?.id);
      console.log('  name:', grandparent?.name);
      console.log('  level:', grandparent?.level);
    } else {
      console.log('\n父节点没有parentId（即为根节点）');
    }
  }
}

check().finally(() => prisma.$disconnect());
