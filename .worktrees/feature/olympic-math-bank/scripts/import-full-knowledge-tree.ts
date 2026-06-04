import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// 从环境变量或命令行参数获取Excel路径
const excelPath = process.argv[2] || process.env.KNOWLEDGE_TREE_EXCEL;
const tempJsonPath = path.resolve(__dirname, '../temp_knowledge_tree.json');

async function importFullKnowledgeTree() {
  console.log('开始导入完整知识树...');

  if (!excelPath) {
    console.error('请提供Excel文件路径: npx tsx scripts/import-full-knowledge-tree.ts <excel-path>');
    process.exit(1);
  }

  console.log(`Excel文件路径: ${excelPath}`);

  // 检查文件是否存在
  if (!fs.existsSync(excelPath)) {
    console.error(`Excel文件不存在: ${excelPath}`);
    process.exit(1);
  }
  
  // 清空现有数据
  console.log('清空现有知识标签...');
  await prisma.questionKnowledgeTag.deleteMany({}).catch(() => {});
  await prisma.knowledgeTag.deleteMany({}).catch(() => {});
  
  // 使用Python读取Excel并保存到临时JSON文件
  const pythonScript = `
import pandas as pd
import json
import sys

try:
    df = pd.read_excel(r'${excelPath.replace(/\\/g, '\\\\')}')
    # 重命名列
    df.columns = ['level1', 'level2', 'level3', 'level4', 'level5', 'order']
    # 填充空值
    df = df.fillna('')
    # 转换order为整数
    df['order'] = pd.to_numeric(df['order'], errors='coerce').fillna(0).astype(int)
    # 保存到临时JSON文件
    with open(r'${tempJsonPath.replace(/\\/g, '\\\\')}', 'w', encoding='utf-8') as f:
        json.dump(df.to_dict(orient='records'), f, ensure_ascii=False)
    print('SUCCESS')
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
`;
  
  try {
    console.log('读取Excel文件...');
    execSync(`python -c "${pythonScript}"`, { encoding: 'utf-8' });
    
    // 读取临时JSON文件
    const jsonContent = fs.readFileSync(tempJsonPath, 'utf-8');
    const rows = JSON.parse(jsonContent);
    console.log(`读取到 ${rows.length} 行数据`);
    
    // 删除临时文件
    fs.unlinkSync(tempJsonPath);
    
    const createdNodes = new Map<string, string>();
    let successCount = 0;
    let skipCount = 0;
    
    // 按顺序处理每一行
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const level1 = row.level1?.trim() || '';
      const level2 = row.level2?.trim() || '';
      const level3 = row.level3?.trim() || '';
      const level4 = row.level4?.trim() || '';
      const level5 = row.level5?.trim() || '';
      const order = row.order || (i + 1);
      
      if (!level1) continue;
      
      // 确定层级和名称
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
        skipCount++;
        continue;
      }
      
      // 获取父节点ID
      let parentId: string | undefined;
      if (parentCode && createdNodes.has(parentCode)) {
        parentId = createdNodes.get(parentCode);
      }
      
      try {
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
        successCount++;
        
        if (successCount % 100 === 0) {
          console.log(`已导入 ${successCount} 个节点...`);
        }
      } catch (error) {
        console.error(`创建节点失败 ${code}:`, error);
      }
    }
    
    console.log(`\n导入完成！`);
    console.log(`成功导入: ${successCount} 个节点`);
    console.log(`跳过重复: ${skipCount} 个节点`);
    
  } catch (error) {
    console.error('导入失败:', error);
    console.log('\n请确保已安装 pandas 和 openpyxl:');
    console.log('  pip install pandas openpyxl');
    process.exit(1);
  }
}

async function main() {
  try {
    await importFullKnowledgeTree();
  } catch (error) {
    console.error('程序错误:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
