const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:./lib/db/test.db' } } });

async function main() {
  // 获取所有知识标签的一级（module）
  const modules = await prisma.knowledgeTag.findMany({
    where: { level: 1 },
    select: { id: true, name: true, module: true }
  });

  console.log('一级标签（模块）:');
  modules.forEach(m => console.log(`  - ${m.name} (${m.module})`));

  // 获取所有标签及其父级
  const allTags = await prisma.knowledgeTag.findMany({
    where: { level: 5 },
    include: {
      parent: {
        include: {
          parent: {
            include: {
              parent: {
                include: {
                  parent: true
                }
              }
            }
          }
        }
      }
    },
    take: 10
  });

  console.log('\n部分五级标签及其完整路径:');
  allTags.forEach(t => {
    const path = [
      t.parent?.parent?.parent?.parent?.name,
      t.parent?.parent?.parent?.name,
      t.parent?.parent?.name,
      t.parent?.name,
      t.name
    ].filter(Boolean).join(' - ');
    console.log(`  - ${path}`);
  });

  // 检查按module筛选是否能找到题目
  console.log('\n按模块筛选题目数量:');
  for (const mod of modules) {
    const count = await prisma.questionKnowledgeTag.count({
      where: {
        knowledgeTag: {
          module: mod.module
        }
      }
    });
    console.log(`  ${mod.name}: ${count} 道题目`);
  }
}
main().finally(() => prisma.$disconnect());
