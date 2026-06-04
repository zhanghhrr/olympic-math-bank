import { PrismaClient } from '@prisma/client';
import { knowledgeKeywords } from '../lib/ocr/knowledge-keywords';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./lib/db/dev.db' } },
});

const TAG_NAMES = [
  '枚举法', '方法计数', '排列', '排列问题', '数字组合', '乘法原理',
  '分配问题', '加法原理', '行程问题', '相遇问题', '追及问题', '鸡兔同笼',
  '长方形面积', '面积计算', '等差数列', '数列求和', '分数加减',
  '三角形面积', '圆的周长', '质数', '合数', '长方体', '体积计算',
  '标数法', '标准标数法',
];

async function main() {
  console.log('=== 检查关键词库中的标签名在数据库中是否存在 ===\n');

  for (const name of TAG_NAMES) {
    const tag = await prisma.knowledgeTag.findFirst({ where: { name } });
    const kw = knowledgeKeywords[name];
    console.log(`${tag ? '✅' : '❌'} ${name} | 数据库: ${tag ? `L${tag.level} (id=${tag.id.slice(0,8)}...)` : '不存在'} | 关键词: ${kw ? kw.slice(0,3).join(', ') : '无'}`);
  }

  console.log('\n=== 检查 matching 标签名命名差异（模糊搜索示例）===');

  const samples = [
    { kw: '三角函数角度计算', db: '角度计算' },
    { kw: '几何面积计算', db: '面积计算' },
    { kw: '几何周长计算', db: '周长计算' },
    { kw: '鸡兔同笼', db: '鸡兔同笼' },
    { kw: '数列求和', db: '数列求和' },
  ];

  for (const s of samples) {
    const exact = await prisma.knowledgeTag.findFirst({ where: { name: s.kw } });
    const fuzzy = await prisma.knowledgeTag.findFirst({ where: { name: { contains: s.kw } } });
    console.log(`"${s.kw}": 精确=${exact?.name || '无'}, 模糊=${fuzzy?.name || '无'}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
