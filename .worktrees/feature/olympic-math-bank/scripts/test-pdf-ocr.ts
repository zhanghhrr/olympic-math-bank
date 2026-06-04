/**
 * PDF OCR识别测试脚本
 * 使用项目内部的MinerU客户端进行识别
 * 用法: npx tsx scripts/test-pdf-ocr.ts <pdf-path>
 */

import { processPDF } from '../lib/ocr/mineru-client';
import * as fs from 'fs';
import * as path from 'path';

const pdfPath = process.argv[2];
const outputDir = path.join(process.cwd(), 'test-output');

async function main() {
  console.log('=== PDF OCR识别测试 ===\n');

  if (!pdfPath) {
    console.error('❌ 请提供PDF文件路径');
    console.log('用法: npx tsx scripts/test-pdf-ocr.ts <pdf-path>');
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ 文件不存在: ${pdfPath}`);
    process.exit(1);
  }

  console.log(`📄 文件: ${path.basename(pdfPath)}`);
  console.log(`📁 输出目录: ${outputDir}\n`);

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 处理PDF
  console.log('⏳ 开始OCR识别...\n');
  const result = await processPDF(pdfPath, outputDir);

  if (!result.success) {
    console.error(`❌ 处理失败: ${result.error}`);
    process.exit(1);
  }

  console.log(`\n✅ 识别完成!`);
  console.log(`📊 共识别到 ${result.questions?.length || 0} 道题目\n`);

  // 保存原始markdown内容
  if (result.markdownContent) {
    const mdPath = path.join(outputDir, 'raw-content.md');
    fs.writeFileSync(mdPath, result.markdownContent, 'utf-8');
    console.log(`📝 原始内容已保存: ${mdPath}`);
  }

  // 保存识别的题目为JSON
  if (result.questions && result.questions.length > 0) {
    const questionsPath = path.join(outputDir, 'questions.json');
    fs.writeFileSync(questionsPath, JSON.stringify(result.questions, null, 2), 'utf-8');
    console.log(`📋 题目数据已保存: ${questionsPath}`);

    // 生成markdown格式的题目列表
    let mdContent = '# 识别到的题目\n\n';
    result.questions.forEach((q, index) => {
      mdContent += `## 第${index + 1}题\n\n`;
      mdContent += `**题干：**\n${q.content}\n\n`;
      if (q.answer) {
        mdContent += `**答案：**\n${q.answer}\n\n`;
      }
      if (q.analysis) {
        mdContent += `**解析：**\n${q.analysis}\n\n`;
      }
      if (q.hasImage) {
        mdContent += `*(包含图片)*\n\n`;
      }
      mdContent += '---\n\n';
    });

    const questionsMdPath = path.join(outputDir, 'questions.md');
    fs.writeFileSync(questionsMdPath, mdContent, 'utf-8');
    console.log(`📄 题目列表已保存: ${questionsMdPath}\n`);

    // 显示题目预览
    console.log('=== 题目预览 ===\n');
    result.questions.forEach((q, index) => {
      console.log(`第${index + 1}题:`);
      console.log(`  题干: ${q.content.substring(0, 80).replace(/\n/g, ' ')}...`);
      if (q.answer) {
        console.log(`  答案: ${q.answer.substring(0, 50).replace(/\n/g, ' ')}...`);
      }
      console.log('');
    });
  }

  console.log('=== 测试完成 ===');
}

main().catch(console.error);
