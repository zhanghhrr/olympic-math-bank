/**
 * 测试 OCR 结果导入数据库
 * 用法: node scripts/test-import-ocr.mjs <ocr_result.json>
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';

const prisma = new PrismaClient();

async function importOCRToDB(filePath) {
  console.log(`📄 读取文件: ${filePath}`);

  // 读取 JSON 文件
  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content);

  // 提取结果
  let results = [];
  if (data.results && Array.isArray(data.results)) {
    results = data.results;
  } else if (Array.isArray(data)) {
    results = data;
  } else if (data.parsed) {
    results = [data];
  }

  console.log(`📊 共 ${results.length} 页识别结果`);

  // 获取或创建一个测试用户
  let user = await prisma.user.findFirst();
  if (!user) {
    console.log('创建测试用户...');
    user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: '测试用户',
        role: 'ADMIN',
        password: 'test123'
      }
    });
  }
  console.log(`使用用户: ${user.id}`);

  let imported = 0;
  let failed = 0;

  for (const result of results) {
    if (!result.success || !result.parsed) {
      console.log(`⚠️ 跳过第 ${result.page || '?'} 页: 识别失败`);
      failed++;
      continue;
    }

    const parsed = result.parsed;

    // 检查内容有效性
    if (!parsed.content || parsed.content.length < 10) {
      console.log(`⚠️ 跳过第 ${result.page || '?'} 页: 内容过短`);
      failed++;
      continue;
    }

    // 确定题目类型
    const questionType = parsed.options?.length > 0 ? 'SINGLE_CHOICE' : 'SOLUTION';

    // 处理选项
    let optionsJson = null;
    if (parsed.options?.length > 0) {
      const optionsMap = {};
      parsed.options.forEach((opt, index) => {
        const label = String.fromCharCode(65 + index);
        const content = opt.replace(/^[A-F][\.、\s]*/, '').trim();
        optionsMap[label] = content;
      });
      optionsJson = JSON.stringify(optionsMap);
    }

    try {
      // 创建题目
      const question = await prisma.question.create({
        data: {
          content: parsed.content.substring(0, 2000), // 限制长度
          answer: parsed.answer?.substring(0, 500) || '',
          solution: parsed.solution?.substring(0, 2000) || null,
          type: questionType,
          options: optionsJson,
          grade: 'P3', // 三年级
          difficulty: 3, // 中等难度
          source: `OCR导入-第${result.page || '?'}页`,
          status: 'PENDING',
          createdById: user.id,
        }
      });

      console.log(`✅ 第 ${result.page || '?'} 页导入成功: ${question.id}`);
      imported++;
    } catch (error) {
      console.error(`❌ 第 ${result.page || '?'} 页导入失败:`, error.message);
      failed++;
    }
  }

  console.log('\n📈 导入结果:');
  console.log(`  - 成功: ${imported}`);
  console.log(`  - 失败: ${failed}`);
  console.log(`  - 总计: ${results.length}`);

  if (imported > 0) {
    console.log('\n💡 提示: 导入的题目状态为"待审核",请前往审核页面进行审核');
    console.log(`   访问: http://localhost:3001/review`);
  }
}

// CLI
async function main() {
  const filePath = process.argv[2] || 'C:/Users/Twilight/Desktop/ocr_result.json';

  try {
    await importOCRToDB(filePath);
  } catch (error) {
    console.error('导入失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
