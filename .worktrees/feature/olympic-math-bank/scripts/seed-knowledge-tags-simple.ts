import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 简化的知识标签数据（示例）
const knowledgeData = [
  // 计算模块
  { level: 1, name: '计算模块', module: '计算模块' },
  { level: 2, name: '整数', module: '计算模块', topic: '整数' },
  { level: 3, name: '整数加减', module: '计算模块', topic: '整数', subtopic: '整数加减' },
  { level: 4, name: '整数加法运算', module: '计算模块', topic: '整数', subtopic: '整数加减', knowledge: '整数加法运算' },
  { level: 5, name: '加法横式', module: '计算模块', topic: '整数', subtopic: '整数加减', knowledge: '整数加法运算', skill: '加法横式' },
  { level: 5, name: '加法竖式', module: '计算模块', topic: '整数', subtopic: '整数加减', knowledge: '整数加法运算', skill: '加法竖式' },
  { level: 4, name: '整数减法运算', module: '计算模块', topic: '整数', subtopic: '整数加减', knowledge: '整数减法运算' },
  { level: 5, name: '减法横式', module: '计算模块', topic: '整数', subtopic: '整数加减', knowledge: '整数减法运算', skill: '减法横式' },
  { level: 5, name: '减法竖式', module: '计算模块', topic: '整数', subtopic: '整数加减', knowledge: '整数减法运算', skill: '减法竖式' },
  
  // 几何模块
  { level: 1, name: '几何模块', module: '几何模块' },
  { level: 2, name: '直线型', module: '几何模块', topic: '直线型' },
  { level: 3, name: '图形认知', module: '几何模块', topic: '直线型', subtopic: '图形认知' },
  { level: 4, name: '线的认识', module: '几何模块', topic: '直线型', subtopic: '图形认知', knowledge: '线的认识' },
  { level: 4, name: '图形认知角', module: '几何模块', topic: '直线型', subtopic: '图形认知', knowledge: '图形认知角' },
  
  // 应用题模块
  { level: 1, name: '应用题模块', module: '应用题模块' },
  { level: 2, name: '和差倍问题', module: '应用题模块', topic: '和差倍问题' },
  { level: 3, name: '和差问题', module: '应用题模块', topic: '和差倍问题', subtopic: '和差问题' },
  { level: 4, name: '基本和差问题', module: '应用题模块', topic: '和差倍问题', subtopic: '和差问题', knowledge: '基本和差问题' },
  
  // 数论模块
  { level: 1, name: '数论模块', module: '数论模块' },
  { level: 2, name: '奇数与偶数', module: '数论模块', topic: '奇数与偶数' },
  { level: 3, name: '奇数与偶数的认识', module: '数论模块', topic: '奇数与偶数', subtopic: '奇数与偶数的认识' },
  
  // 行程模块
  { level: 1, name: '行程模块', module: '行程模块' },
  { level: 2, name: '直线型行程问题', module: '行程模块', topic: '直线型行程问题' },
  { level: 3, name: '路程速度时间', module: '行程模块', topic: '直线型行程问题', subtopic: '路程速度时间' },
  
  // 组合模块
  { level: 1, name: '组合模块', module: '组合模块' },
  { level: 2, name: '逻辑推理', module: '组合模块', topic: '逻辑推理' },
  { level: 3, name: '比较型逻辑推理', module: '组合模块', topic: '逻辑推理', subtopic: '比较型逻辑推理' },
];

async function seedKnowledgeTags() {
  console.log('开始导入知识标签...');
  
  // 清空现有数据（跳过关联表，直接删除知识标签）
  try {
    await prisma.knowledgeTag.deleteMany({});
    console.log('已清空现有知识标签');
  } catch (error) {
    console.log('知识标签表为空或不存在，继续导入');
  }
  
  const createdNodes = new Map<string, string>();
  
  // 按层级排序
  const sortedData = [...knowledgeData].sort((a, b) => a.level - b.level);
  
  for (let i = 0; i < sortedData.length; i++) {
    const item = sortedData[i];
    const { level, name, module, topic, subtopic, knowledge, skill } = item;
    
    // 生成code
    let code = module;
    if (skill) code = `${module}-${topic}-${subtopic}-${knowledge}-${skill}`;
    else if (knowledge) code = `${module}-${topic}-${subtopic}-${knowledge}`;
    else if (subtopic) code = `${module}-${topic}-${subtopic}`;
    else if (topic) code = `${module}-${topic}`;
    
    if (createdNodes.has(code)) {
      console.log(`跳过重复节点: ${code}`);
      continue;
    }
    
    // 查找父节点
    let parentId: string | undefined;
    let parentCode = '';
    
    if (level > 1) {
      if (level === 5 && knowledge) parentCode = `${module}-${topic}-${subtopic}-${knowledge}`;
      else if (level === 4 && subtopic) parentCode = `${module}-${topic}-${subtopic}`;
      else if (level === 3 && topic) parentCode = `${module}-${topic}`;
      else if (level === 2) parentCode = module;
      
      parentId = createdNodes.get(parentCode);
    }
    
    try {
      const node = await prisma.knowledgeTag.create({
        data: {
          level,
          name,
          code,
          module,
          topic: topic || null,
          subtopic: subtopic || null,
          knowledge: knowledge || null,
          skill: skill || null,
          parentId,
          order: i + 1,
        },
      });
      
      createdNodes.set(code, node.id);
      console.log(`创建 ${level}级节点: ${name} (${code})`);
    } catch (error) {
      console.error(`创建节点失败 ${code}:`, error);
    }
  }
  
  console.log(`\n成功导入 ${createdNodes.size} 个知识标签`);
}

async function main() {
  try {
    await seedKnowledgeTags();
  } catch (error) {
    console.error('导入失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
