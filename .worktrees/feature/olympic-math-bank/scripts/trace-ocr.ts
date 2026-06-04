/**
 * 详细追踪OCR识别流程
 */

import * as fs from 'fs';
import * as path from 'path';
import { processPDF } from '../lib/ocr/mineru-client';

const pdfPath = 'C:/Users/Twilight/Desktop/【26春季】三年级第六周刷题课-集训队(教师版).pdf';
const uploadDir = './test-output';

async function traceOCR() {
  console.log('=== 详细追踪OCR流程 ===\n');
  console.log('PDF路径:', pdfPath);
  console.log('输出目录:', uploadDir);
  console.log('');

  // 清理旧文件
  if (fs.existsSync(uploadDir)) {
    fs.readdirSync(uploadDir).forEach(f => {
      fs.rmSync(path.join(uploadDir, f), { recursive: true });
    });
  }

  const result = await processPDF(pdfPath, uploadDir);

  console.log('\n=== 识别结果 ===');
  console.log('成功:', result.success);
  console.log('题目数:', result.questions?.length || 0);
  console.log('错误:', result.error || '无');

  // 检查生成的文件
  console.log('\n=== 生成的文件 ===');
  if (fs.existsSync(uploadDir)) {
    const files = fs.readdirSync(uploadDir);
    files.forEach(f => {
      const stat = fs.statSync(path.join(uploadDir, f));
      console.log(`- ${f} (${stat.size} bytes)`);
    });
  }
}

traceOCR().catch(console.error);
