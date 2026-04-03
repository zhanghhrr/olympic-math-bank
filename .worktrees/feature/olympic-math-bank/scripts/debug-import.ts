/**
 * 调试导入流程
 * 检查从OCR到数据库导入的完整流程
 */

import { processPDF } from '../lib/ocr/mineru-client';
import { smartImportFromOCR } from '../lib/ocr/import-to-db';
import { prisma } from '../lib/db/prisma';
import * as path from 'path';

const pdfPath = 'C:/Users/Twilight/Desktop/【26春季】三年级第六周刷题课-集训队(教师版).pdf';
const uploadDir = './test-output';

async function debugImport() {
  console.log('=== 调试PDF导入流程 ===\n');

  // 1. OCR识别
  console.log('1. OCR识别...');
  const ocrResult = await processPDF(pdfPath, uploadDir);

  if (!ocrResult.success || !ocrResult.questions) {
    console.error('OCR识别失败:', ocrResult.error);
    return;
  }

  console.log(`   ✓ OCR识别完成: ${ocrResult.questions.length} 道题目\n`);

  // 打印每道题的摘要
  console.log('2. 题目列表:');
  ocrResult.questions.forEach((q, i) => {
    const hasAnswer = !!(q.answer && q.answer.length > 0);
    const contentPreview = q.content?.substring(0, 50).replace(/\n/g, ' ');
    console.log(`   ${i + 1}. ${hasAnswer ? '✓' : '✗'} ${contentPreview}...`);
  });
  console.log();

  // 2. 准备导入数据
  const ocrResults = ocrResult.questions.map((q, idx) => ({
    success: true as const,
    parsed: q,
    page: 1,
    questionNumber: idx + 1
  }));

  // 3. 获取或创建默认用户
  let user = await prisma.user.findFirst({
    where: { email: 'admin@example.com' }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        name: '管理员',
        role: 'ADMIN',
      }
    });
    console.log('3. 创建默认用户:', user.id);
  } else {
    console.log('3. 使用现有用户:', user.id);
  }

  // 4. 导入数据库
  console.log('\n4. 开始导入数据库...');
  const importResult = await smartImportFromOCR(ocrResults, user.id, {
    grade: 'P3',
    source: '调试导入',
    autoMatchTags: true
  });

  console.log(`\n5. 导入结果:`);
  console.log(`   - 总数: ${importResult.total}`);
  console.log(`   - 成功: ${importResult.success}`);
  console.log(`   - 失败: ${importResult.failed}`);

  // 打印失败的题目
  const failedQuestions = importResult.questions.filter(q => !q.success);
  if (failedQuestions.length > 0) {
    console.log('\n6. 失败的题目:');
    failedQuestions.forEach((q, i) => {
      console.log(`   ${i + 1}. 错误: ${q.error}`);
    });
  }

  // 打印成功题目的标签匹配情况
  const successQuestions = importResult.questions.filter(q => q.success);
  console.log(`\n7. 成功导入的题目标签匹配情况:`);
  successQuestions.forEach((q, i) => {
    const tagCount = q.matchedTags?.length || 0;
    console.log(`   题目 ${i + 1}: ${tagCount} 个标签`);
    if (q.matchedTagDetails && q.matchedTagDetails.length > 0) {
      q.matchedTagDetails.forEach(tag => {
        console.log(`      - ${tag.name}`);
      });
    }
  });

  await prisma.$disconnect();
}

debugImport().catch(console.error);
