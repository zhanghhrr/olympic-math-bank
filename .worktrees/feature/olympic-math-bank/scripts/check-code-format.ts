import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./lib/db/test.db'
    }
  }
});

async function check() {
  // 查找体育比赛和积分制标签的code
  const tags = await prisma.knowledgeTag.findMany({
    where: {
      OR: [
        { name: '体育比赛' },
        { name: { contains: '积分制' } }
      ]
    }
  });

  console.log('数据库中的code格式:');
  tags.forEach(t => {
    console.log(`  ${t.name}:`);
    console.log(`    code: "${t.code}"`);
    console.log(`    使用分隔符: ${t.code.includes('->') ? '-> (箭头)' : t.code.includes('-') ? '- (横线)' : '其他'}`);
    console.log('');
  });

  // 检查seed脚本生成的code格式
  console.log('\nseed脚本生成的code格式 (使用->):');
  console.log('  体育比赛: "组合模块->逻辑推理->体育比赛"');
  console.log('  2-0 积分制: "组合模块->逻辑推理->体育比赛->2-0  积分制"');

  // 比较
  const sports = tags.find(t => t.name === '体育比赛');
  if (sports) {
    console.log('\n是否匹配?');
    console.log(`  数据库code: "${sports.code}"`);
    console.log(`  seed生成code: "组合模块->逻辑推理->体育比赛"`);
    console.log(`  匹配: ${sports.code === '组合模块->逻辑推理->体育比赛'}`);
  }
}

check().finally(() => prisma.$disconnect());
