/**
 * 同步知识树数据到测试环境
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// 生产环境数据库
const prodPrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./lib/db/dev.db',
    },
  },
});

// 测试环境数据库
const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./lib/db/test.db',
    },
  },
});

async function syncKnowledgeTree() {
  console.log('开始同步知识树数据到测试环境...\n');

  try {
    // 从生产环境读取知识标签
    console.log('从生产环境读取知识标签...');
    const prodTags = await prodPrisma.knowledgeTag.findMany({
      orderBy: [
        { level: 'asc' },
        { order: 'asc' },
      ],
    });

    console.log(`生产环境共有 ${prodTags.length} 个知识标签`);

    if (prodTags.length === 0) {
      console.log('生产环境没有知识标签数据，请先运行导入脚本');
      return;
    }

    // 清空测试环境的知识标签
    console.log('\n清空测试环境的知识标签...');
    await testPrisma.questionKnowledgeTag.deleteMany();
    await testPrisma.knowledgeTag.deleteMany();
    console.log('测试环境已清空');

    // 创建ID映射（旧ID -> 新ID）
    const idMap = new Map<string, string>();

    // 按层级导入（先导入一级，再二级，以此类推）
    const maxLevel = Math.max(...prodTags.map(t => t.level));

    for (let level = 1; level <= maxLevel; level++) {
      const levelTags = prodTags.filter(t => t.level === level);
      console.log(`\n导入第 ${level} 级标签 (${levelTags.length} 个)...`);

      for (const tag of levelTags) {
        // 查找父节点的新ID
        let newParentId: string | null = null;
        if (tag.parentId) {
          newParentId = idMap.get(tag.parentId) || null;
        }

        // 创建新标签
        const newTag = await testPrisma.knowledgeTag.create({
          data: {
            level: tag.level,
            name: tag.name,
            code: tag.code,
            module: tag.module,
            topic: tag.topic,
            subtopic: tag.subtopic,
            knowledge: tag.knowledge,
            skill: tag.skill,
            parentId: newParentId,
            order: tag.order,
          },
        });

        // 记录ID映射
        idMap.set(tag.id, newTag.id);

        if (levelTags.length <= 10 || levelTags.indexOf(tag) < 3 || levelTags.indexOf(tag) >= levelTags.length - 2) {
          console.log(`  ✓ ${tag.name}`);
        } else if (levelTags.indexOf(tag) === 3) {
          console.log(`  ... (${levelTags.length - 6} 个省略)`);
        }
      }
    }

    // 验证导入结果
    const testCount = await testPrisma.knowledgeTag.count();
    console.log(`\n✅ 同步完成！测试环境共有 ${testCount} 个知识标签`);

    // 打印统计
    const stats = await testPrisma.knowledgeTag.groupBy({
      by: ['level'],
      _count: { id: true },
    });

    console.log('\n各级标签数量:');
    const levelNames = ['', '一级模块', '二级专题', '三级子专题', '四级知识点', '五级技能'];
    for (const stat of stats.sort((a, b) => a.level - b.level)) {
      console.log(`  ${levelNames[stat.level]}: ${stat._count.id} 个`);
    }

  } catch (error) {
    console.error('\n❌ 同步失败:', error);
    throw error;
  } finally {
    await prodPrisma.$disconnect();
    await testPrisma.$disconnect();
  }
}

syncKnowledgeTree();
