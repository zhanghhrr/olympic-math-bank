import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// 设置数据库路径
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./lib/db/dev.db';
}

const prisma = new PrismaClient();

interface KnowledgeRecord {
  '一级模块': string | null;
  '二级模块': string | null;
  '三级模块': string | null;
  '四级模块': string | null;
  '五级知识点': string | null;
  '序号': number | null;
}

async function importKnowledgeTree() {
  try {
    // 读取JSON数据
    const jsonPath = path.join(process.cwd(), 'data', 'knowledge-tree.json');
    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const records: KnowledgeRecord[] = JSON.parse(rawData);

    console.log(`开始导入 ${records.length} 条知识标签记录...`);

    // 在事务中清空并重新导入，防止中途崩溃导致数据丢失
    await prisma.$transaction(async (tx) => {
      await tx.questionKnowledgeTag.deleteMany();
      await tx.knowledgeTag.deleteMany();
      console.log('已清空现有知识标签');
    });

    // 用于存储已创建的节点，避免重复
    const createdNodes = new Map<string, string>(); // key: code, value: id

    let importedCount = 0;

    for (const record of records) {
      const moduleName = record['一级模块'];
      if (!moduleName) continue;

      // 获取各级名称
      const topicName = record['二级模块'];
      const subtopicName = record['三级模块'];
      const knowledgeName = record['四级模块'];
      const skillName = record['五级知识点'];

      // 确定最深的非空级别
      let currentLevel = 1;
      let currentName = moduleName;
      let currentCode = moduleName;

      // 逐级创建/获取节点
      for (let level = 1; level <= 5; level++) {
        // 确定当前级别的名称和code
        if (level === 1) {
          currentName = moduleName;
          currentCode = moduleName;
        } else if (level === 2 && topicName) {
          currentName = topicName;
          currentCode = `${moduleName}-${topicName}`;
        } else if (level === 3 && subtopicName) {
          currentName = subtopicName;
          currentCode = `${moduleName}-${topicName}-${subtopicName}`;
        } else if (level === 4 && knowledgeName) {
          currentName = knowledgeName;
          currentCode = `${moduleName}-${topicName}-${subtopicName}-${knowledgeName}`;
        } else if (level === 5 && skillName) {
          currentName = skillName;
          currentCode = `${moduleName}-${topicName}-${subtopicName}-${knowledgeName}-${skillName}`;
        } else {
          // 当前级别为空，跳过
          continue;
        }

        // 检查是否已创建
        if (createdNodes.has(currentCode)) {
          currentLevel = level;
          continue;
        }

        // 获取父节点ID
        let parentId: string | null = null;
        if (level > 1) {
          const parentCode = currentCode.substring(0, currentCode.lastIndexOf('-'));
          if (createdNodes.has(parentCode)) {
            parentId = createdNodes.get(parentCode)!;
          }
        }

        // 创建节点
        const createdTag = await prisma.knowledgeTag.create({
          data: {
            level: level,
            name: currentName,
            code: currentCode,
            module: moduleName,
            topic: topicName,
            subtopic: subtopicName,
            knowledge: knowledgeName,
            skill: skillName,
            parentId: parentId,
            order: record['序号'] || 0,
          },
        });

        createdNodes.set(currentCode, createdTag.id);
        importedCount++;
        currentLevel = level;

        // 打印进度
        if (importedCount % 100 === 0) {
          console.log(`  已导入 ${importedCount} 个节点...`);
        }

        // 如果当前级别没有更深的数据，跳出循环
        if (level === 2 && !subtopicName) break;
        if (level === 3 && !knowledgeName) break;
        if (level === 4 && !skillName) break;
      }
    }

    console.log(`\n知识标签导入完成！共导入 ${importedCount} 个节点`);

    // 打印统计
    const stats = await prisma.knowledgeTag.groupBy({
      by: ['level'],
      _count: { id: true },
    });

    console.log('\n各级标签数量:');
    const levelNames = ['', '一级模块', '二级专题', '三级子专题', '四级知识点', '五级技能'];
    for (const stat of stats.sort((a, b) => a.level - b.level)) {
      console.log(`  ${levelNames[stat.level]}: ${stat._count.id} 个`);
    }

  } catch (error) {
    console.error('导入失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importKnowledgeTree();
