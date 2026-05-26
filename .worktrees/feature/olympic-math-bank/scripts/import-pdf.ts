/**
 * PDF 导入脚本
 * 使用本地 RapidOCR（PyMuPDF + docling + RapidOCR）识别 PDF 并导入题库
 */

// 设置环境变量
process.env.DATABASE_URL = 'file:./lib/db/dev.db';

import { processPDF } from '../lib/ocr/rapidocr-client';
import { smartImportFromOCR } from '../lib/ocr/import-to-db';
import { prisma } from '../lib/db/prisma';
import * as fs from 'fs';

async function importPDF(pdfPath: string) {
  console.log(`[导入] 开始处理: ${pdfPath}`);

  // 调用本地 RapidOCR
  console.log('[OCR] 调用本地 RapidOCR 识别...');
  const [grade] = PDF_GRADE_MAP.filter(([, re]) => re.test(pdfPath)).find(() => true) || ['P3'];
  console.log(`[OCR] 推定年级: ${grade}`);

  const outputDir = './uploads/ocr';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const result = await processPDF(pdfPath, outputDir, {
    model: 'mobile',
    dpi: 200,
  });

  if (!result.success) {
    console.error('[OCR] 识别失败:', result.error);
    return;
  }

  console.log(`[OCR] 识别成功! (${result.elapsed?.toFixed(1)}s, ${result.pages} 页)`);
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
      grade: grade as any,
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

const PDF_GRADE_MAP: [string, RegExp][] = [
  ['P1', /1\s*年级|一年级|1S|一S/i],
  ['P2', /2\s*年级|二年级|2S|二S/i],
  ['P3', /3\s*年级|三年级|3S|三S/i],
  ['P4', /4\s*年级|四年级|4S|四S/i],
  ['P5', /5\s*年级|五年级|5S|五S/i],
  ['P6', /6\s*年级|六年级|6S|六S/i],
];

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
