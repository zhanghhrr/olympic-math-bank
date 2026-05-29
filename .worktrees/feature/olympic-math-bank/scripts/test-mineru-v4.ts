/**
 * MinerU v4 API 集成测试脚本 (全量验证版)
 * 用法: npx tsx scripts/test-mineru-v4.ts
 */

import { processPDF } from '../lib/ocr/mineru-client';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  const outputDir = path.resolve(process.cwd(), 'uploads', 'ocr');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 测试文件列表
  const testFiles = [
    'uploads/ocr/1775716099743-4S春4 多人相遇与追及 小测(教师版).pdf',
    'uploads/ocr/1775716060538-4S春4 多次相遇问题 小测(教师版).pdf',
  ];

  console.log('='.repeat(60));
  console.log('MinerU v4 API 全量验证测试');
  console.log('='.repeat(60));

  for (const testFile of testFiles) {
    if (!fs.existsSync(testFile)) {
      console.log(`\n跳过(文件不存在): ${testFile}`);
      continue;
    }

    const fileSize = (fs.statSync(testFile).size / 1024).toFixed(1);
    console.log(`\n--- 测试: ${path.basename(testFile)} (${fileSize} KB) ---`);

    const result = await processPDF(testFile, outputDir);

    console.log(`  成功: ${result.success}`);
    console.log(`  耗时: ${result.elapsed?.toFixed(1)}s`);
    console.log(`  页数: ${result.pages ?? '?'}`);
    console.log(`  题目数: ${result.questions?.length ?? 0}`);
    console.log(`  MD大小: ${((result.markdownContent?.length ?? 0) / 1024).toFixed(1)} KB`);
    console.log(`  Block数: ${result.structuredData?.blocks?.length ?? 0}`);
    console.log(`  公式数: ${result.structuredData?.formulas?.length ?? 0}`);

    if (result.error) {
      console.log(`  错误: ${result.error}`);
    }

    if (result.questions && result.questions.length > 0) {
      for (let i = 0; i < Math.min(2, result.questions.length); i++) {
        const q = result.questions[i];
        console.log(`  [题${i + 1}] ${q.content?.replace(/\n/g, ' ').substring(0, 80)}...`);
        console.log(`         答案: ${q.answer?.substring(0, 50) || '(无)'}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('全量测试完成');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
