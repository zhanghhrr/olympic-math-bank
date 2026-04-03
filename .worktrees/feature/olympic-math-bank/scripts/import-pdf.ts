/**
 * PDF 导入脚本
 * 使用 MinerU OCR API 识别 PDF 并导入题库
 */

// 设置环境变量
process.env.DATABASE_URL = 'file:./lib/db/dev.db';

import { processPDF } from '../lib/ocr/mineru-client';
import { smartImportFromOCR } from '../lib/ocr/import-to-db';
import { prisma } from '../lib/db/prisma';
import * as fs from 'fs';

async function importPDF(pdfPath: string) {
  console.log(`[导入] 开始处理: ${pdfPath}`);

  // 调用 MinerU OCR
  console.log('[OCR] 调用 MinerU API 识别...');
  const result = await processPDF(pdfPath, './uploads/ocr');

  if (!result.success) {
    console.error('[OCR] 识别失败:', result.error);
    return;
  }

  console.log('[OCR] 识别成功!');
  console.log(`[OCR] 识别到 ${result.questions?.length || 0} 道题目`);

  if (!result.questions || result.questions.length === 0) {
    console.log('[导入] 没有识别到题目');
    return;
  }

  // 获取或创建默认用户
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
    console.log('[用户] 创建默认用户:', user.id);
  }

  // 准备 OCR 结果
  const ocrResults = result.questions.map((q, idx) => ({
    success: true as const,
    parsed: q,
    page: 1,
    questionNumber: idx + 1
  }));

  // 导入数据库
  console.log('[导入] 开始导入数据库...');
  const importResult = await smartImportFromOCR(
    ocrResults,
    user.id,
    {
      grade: 'P3',
      source: 'PDF导入',
      autoMatchTags: true
    }
  );

  console.log('[导入] 完成!');
  console.log('- 总数:', importResult.total);
  console.log('- 成功:', importResult.success);
  console.log('- 失败:', importResult.failed);

  return importResult;
}

// 主函数
async function main() {
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error('用法: npx tsx scripts/import-pdf.ts <pdf路径>');
    console.error('示例: npx tsx scripts/import-pdf.ts "C:\\Users\\Twilight\\Desktop\\test.pdf"');
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`错误: 文件不存在 ${pdfPath}`);
    process.exit(1);
  }

  try {
    await importPDF(pdfPath);
    console.log('\n✅ 导入完成!');
  } catch (error) {
    console.error('\n❌ 导入失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
