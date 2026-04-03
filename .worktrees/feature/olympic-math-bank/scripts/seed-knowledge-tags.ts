#!/usr/bin/env tsx
/**
 * 五级知识标签导入脚本
 * 从 拓展思维知识树_五级.xlsx 导入所有1474个标签到数据库
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

const EXCEL_PATH = 'C:/Users/Twilight/Desktop/拓展思维知识树_五级.xlsx';

function generateCode(module: string, topic: string | null, subtopic: string | null, knowledge: string | null, skill: string | null, level: number): string {
  const parts: string[] = [module];
  if (topic) parts.push(topic);
  if (subtopic) parts.push(subtopic);
  if (knowledge) parts.push(knowledge);
  if (skill) parts.push(skill);
  return parts.join('-');
}

async function importKnowledgeTags() {
  console.log('开始导入五级知识标签...');

  // 读取Excel
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet) as any[];

  console.log(`读取到 ${data.length} 行数据`);

  // 清空现有标签
  await prisma.questionKnowledgeTag.deleteMany({});
  await prisma.knowledgeTag.deleteMany({});
  console.log('已清空现有知识标签');

  // 用于存储已创建的节点，避免重复
  const createdNodes: Record<string, string> = {};
  let insertedCount = 0;

  for (let idx = 0; idx < data.length; idx++) {
    const row = data[idx];
    const module = row['一级模块'] || null;
    const topic = row['二级模块'] || null;
    const subtopic = row['三级模块'] || null;
    const knowledge = row['四级模块'] || null;
    const skill = row['五级知识点'] || null;

    if (!module) continue;

    // 确定当前行的级别和名称
    let level: number;
    let name: string;

    if (skill) {
      level = 5;
      name = skill;
    } else if (knowledge) {
      level = 4;
      name = knowledge;
    } else if (subtopic) {
      level = 3;
      name = subtopic;
    } else if (topic) {
      level = 2;
      name = topic;
    } else {
      level = 1;
      name = module;
    }

    // 生成唯一编码
    const code = generateCode(module, topic, subtopic, knowledge, skill, level);

    // 检查是否已存在
    if (createdNodes[code]) continue;

    // 查找父节点
    let parentId: string | null = null;
    if (level > 1) {
      const parentCode = generateCode(
        module,
        level > 2 ? topic : null,
        level > 3 ? subtopic : null,
        level > 4 ? knowledge : null,
        null,
        level - 1
      );
      parentId = createdNodes[parentCode] || null;
    }

    // 插入数据库
    const tag = await prisma.knowledgeTag.create({
      data: {
        level,
        name,
        code,
        module,
        topic,
        subtopic,
        knowledge,
        skill,
        parentId,
        order: idx,
      },
    });

    createdNodes[code] = tag.id;
    insertedCount++;

    if (insertedCount % 100 === 0) {
      console.log(`已导入 ${insertedCount} 个标签...`);
    }
  }

  console.log(`\n导入完成！共导入 ${insertedCount} 个五级知识标签`);

  // 统计各级别数量
  for (let level = 1; level <= 5; level++) {
    const count = await prisma.knowledgeTag.count({ where: { level } });
    console.log(`  级别 ${level}: ${count} 个标签`);
  }
}

importKnowledgeTags()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
