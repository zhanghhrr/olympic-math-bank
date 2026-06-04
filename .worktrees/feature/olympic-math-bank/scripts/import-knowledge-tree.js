const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function importKnowledgeTree() {
  try {
    // 读取JSON数据
    const jsonPath = path.join(process.cwd(), 'data', 'knowledge-tree.json');
    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const rows = JSON.parse(rawData);

    console.log(`开始导入 ${rows.length} 条知识标签...`);

    // 构建树形结构
    const { tags, stats } = buildTagList(rows);

    console.log('\n统计信息:');
    console.log(`  一级模块: ${stats.module} 个`);
    console.log(`  二级主题: ${stats.topic} 个`);
    console.log(`  三级子主题: ${stats.subtopic} 个`);
    console.log(`  四级知识点: ${stats.knowledge} 个`);
    console.log(`  五级技能点: ${stats.skill} 个`);
    console.log(`  总计: ${tags.length} 个标签`);

    // 清空现有知识标签
    console.log('\n清空现有知识标签...');
    await prisma.questionKnowledgeTag.deleteMany();
    await prisma.knowledgeTag.deleteMany();
    console.log('已清空');

    // 按层级排序导入
    const sortedTags = tags.sort((a, b) => a.level - b.level);

    // 创建标签并记录ID映射
    const idMap = new Map();
    let importedCount = 0;

    for (const tag of sortedTags) {
      const data = {
        name: tag.name,
        type: tag.type,
        level: tag.level,
        fullPath: tag.fullPath,
        order: tag.order || 0,
      };

      // 如果有父标签，使用映射的真实ID
      if (tag.parentPath && idMap.has(tag.parentPath)) {
        data.parentId = idMap.get(tag.parentPath);
      }

      try {
        const created = await prisma.knowledgeTag.create({ data });
        idMap.set(tag.fullPath, created.id);
        importedCount++;

        if (importedCount % 100 === 0) {
          console.log(`  已导入 ${importedCount}/${tags.length}...`);
        }
      } catch (error) {
        console.error(`  导入失败: ${tag.fullPath}`, error.message);
      }
    }

    console.log(`\n✅ 成功导入 ${importedCount} 个知识标签！`);
  } catch (error) {
    console.error('导入失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

function buildTagList(rows) {
  const tagMap = new Map();
  const stats = {
    module: 0,
    topic: 0,
    subtopic: 0,
    knowledge: 0,
    skill: 0,
  };

  for (const row of rows) {
    const levels = [
      { name: row['一级模块'], type: 'MODULE', level: 1 },
      { name: row['二级模块'], type: 'TOPIC', level: 2 },
      { name: row['三级模块'], type: 'SUBTOPIC', level: 3 },
      { name: row['四级模块'], type: 'KNOWLEDGE', level: 4 },
      { name: row['五级知识点'], type: 'SKILL', level: 5 },
    ];

    let currentPath = '';
    let parentPath = '';

    for (const level of levels) {
      if (!level.name) continue;

      parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${level.name}` : level.name;

      if (!tagMap.has(currentPath)) {
        tagMap.set(currentPath, {
          name: level.name,
          type: level.type,
          level: level.level,
          fullPath: currentPath,
          parentPath: parentPath || null,
          order: row['序号'] || 0,
        });

        // 统计
        switch (level.type) {
          case 'MODULE': stats.module++; break;
          case 'TOPIC': stats.topic++; break;
          case 'SUBTOPIC': stats.subtopic++; break;
          case 'KNOWLEDGE': stats.knowledge++; break;
          case 'SKILL': stats.skill++; break;
        }
      }
    }
  }

  return { tags: Array.from(tagMap.values()), stats };
}

importKnowledgeTree();
