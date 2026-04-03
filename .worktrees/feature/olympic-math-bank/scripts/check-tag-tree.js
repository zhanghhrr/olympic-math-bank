const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:./lib/db/test.db' } } });

async function main() {
  // 获取标签树
  const allTags = await prisma.knowledgeTag.findMany({
    orderBy: [{ level: 'asc' }, { order: 'asc' }],
    select: {
      id: true,
      name: true,
      level: true,
      module: true,
      parentId: true,
    }
  });

  // 构建树形结构
  const tagMap = new Map();
  const roots = [];

  allTags.forEach(tag => {
    tagMap.set(tag.id, { ...tag, children: [] });
  });

  allTags.forEach(tag => {
    const node = tagMap.get(tag.id);
    if (tag.parentId && tagMap.has(tag.parentId)) {
      tagMap.get(tag.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  console.log('标签树结构:\n');
  function printTree(nodes, indent = 0) {
    for (const node of nodes) {
      console.log('  '.repeat(indent) + `[L${node.level}] ${node.name} (module: ${node.module})`);
      if (node.children.length > 0) {
        printTree(node.children, indent + 1);
      }
    }
  }
  printTree(roots);

  // 检查哪些module有题目
  console.log('\n\n各模块下的题目数量:');
  const modules = [...new Set(allTags.map(t => t.module))];
  for (const mod of modules) {
    const count = await prisma.questionKnowledgeTag.count({
      where: {
        knowledgeTag: {
          module: mod
        }
      }
    });
    console.log(`  ${mod}: ${count}`);
  }
}
main().finally(() => prisma.$disconnect());
