import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${path.resolve(__dirname, '../lib/db/test.db')}`,
    },
  },
});

interface KnowledgeRow {
  level1: string;  // 一级模块
  level2: string;  // 二级专题
  level3: string;  // 三级子专题
  level4: string;  // 四级知识点
  level5: string;  // 五级技能
  order: number;   // 序号
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function importKnowledgeTags() {
  console.log('开始导入知识标签...');
  
  // 读取Excel导出的CSV文件
  const csvPath = path.resolve(__dirname, '../data/knowledge_tree.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`文件不存在: ${csvPath}`);
    console.log('请先将 "拓展思维知识树_五级.xlsx" 导出为 CSV 格式并保存到 data/knowledge_tree.csv');
    process.exit(1);
  }
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  // 跳过标题行
  const dataLines = lines.slice(1);
  
  // 清空现有知识标签
  await prisma.questionKnowledgeTag.deleteMany({});
  await prisma.knowledgeTag.deleteMany({});
  console.log('已清空现有知识标签');
  
  // 用于跟踪已创建的节点
  const createdNodes = new Map<string, string>(); // code -> id
  
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const parts = parseCSVLine(line);
    
    if (parts.length < 6) continue;
    
    const [level1, level2, level3, level4, level5, orderStr] = parts;
    const order = parseInt(orderStr) || (i + 1);
    
    // 创建五级节点
    await createNode(level1, level2, level3, level4, level5, order, createdNodes);
  }
  
  console.log(`成功导入 ${createdNodes.size} 个知识标签`);
}

async function createNode(
  level1: string,
  level2: string,
  level3: string,
  level4: string,
  level5: string,
  order: number,
  createdNodes: Map<string, string>
) {
  // 确定当前节点的层级和名称
  let level = 1;
  let name = level1;
  let parentCode = '';
  
  if (level5) {
    level = 5;
    name = level5;
    parentCode = `${level1}-${level2}-${level3}-${level4}`;
  } else if (level4) {
    level = 4;
    name = level4;
    parentCode = `${level1}-${level2}-${level3}`;
  } else if (level3) {
    level = 3;
    name = level3;
    parentCode = `${level1}-${level2}`;
  } else if (level2) {
    level = 2;
    name = level2;
    parentCode = level1;
  }
  
  const code = level === 1 ? level1 : `${parentCode}-${name}`;
  
  // 检查是否已创建
  if (createdNodes.has(code)) {
    return createdNodes.get(code)!;
  }
  
  // 获取父节点ID
  let parentId: string | undefined;
  if (parentCode && createdNodes.has(parentCode)) {
    parentId = createdNodes.get(parentCode);
  }
  
  // 创建节点
  const node = await prisma.knowledgeTag.create({
    data: {
      level,
      name,
      code,
      module: level1,
      topic: level2 || null,
      subtopic: level3 || null,
      knowledge: level4 || null,
      skill: level5 || null,
      parentId,
      order,
    },
  });
  
  createdNodes.set(code, node.id);
  console.log(`创建 ${level}级节点: ${code}`);
  
  return node.id;
}

// 从Python读取Excel数据并导入
async function importFromPython() {
  console.log('尝试使用Python读取Excel文件...');

  // 从环境变量或命令行参数获取Excel路径
  const excelPath = process.argv[2] || process.env.KNOWLEDGE_TREE_EXCEL;

  if (!excelPath) {
    console.error('请提供Excel文件路径: npx tsx scripts/import-knowledge-tags.ts <excel-path>');
    return;
  }

  if (!fs.existsSync(excelPath)) {
    console.error(`Excel文件不存在: ${excelPath}`);
    return;
  }
  
  // 清空现有知识标签
  await prisma.questionKnowledgeTag.deleteMany({});
  await prisma.knowledgeTag.deleteMany({});
  console.log('已清空现有知识标签');
  
  // 使用Python读取Excel
  const { execSync } = require('child_process');
  
  const pythonScript = `
import pandas as pd
import json

df = pd.read_excel('${excelPath.replace(/\\/g, '\\')}')
print(df.to_json(orient='records', force_ascii=False))
`;
  
  try {
    const result = execSync(`python -c "${pythonScript}"`, { encoding: 'utf-8' });
    const rows = JSON.parse(result);
    
    const createdNodes = new Map<string, string>();
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const level1 = row['一级模块'] || '';
      const level2 = row['二级模块'] || '';
      const level3 = row['三级模块'] || '';
      const level4 = row['四级模块'] || '';
      const level5 = row['五级知识点'] || '';
      const order = row['序号'] || (i + 1);
      
      if (!level1) continue;
      
      await createNode(level1, level2, level3, level4, level5, order, createdNodes);
    }
    
    console.log(`成功导入 ${createdNodes.size} 个知识标签`);
  } catch (error) {
    console.error('Python读取失败:', error);
    console.log('请确保已安装 pandas: pip install pandas openpyxl');
  }
}

async function main() {
  try {
    // 优先尝试Python方式
    await importFromPython();
  } catch (error) {
    console.error('导入失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
