/**
 * 批量PDF导入脚本
 * 使用本地 RapidOCR + 自动知识标签匹配
 * 
 * 使用方法:
 * npx tsx scripts/batch-import-pdf.ts <PDF目录路径> [选项]
 * 
 * 示例:
 * npx tsx scripts/batch-import-pdf.ts "C:\Users\Twilight\Desktop\26春季\4S" --env=test --grade=P4
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Grade } from '@prisma/client';
import { processPDF } from '../lib/ocr/rapidocr-client';
import { smartImportFromOCR } from '../lib/ocr/import-to-db';

interface ImportOptions {
  environment: 'prod' | 'test';
  grade: Grade;
  source: string;
  autoMatchTags: boolean;
}

function createPrismaClient(env: 'prod' | 'test') {
  const dbUrl = env === 'test' 
    ? 'file:./lib/db/test.db'
    : 'file:./lib/db/dev.db';
  
  return new PrismaClient({
    datasources: {
      db: { url: dbUrl }
    }
  });
}

function listPDFFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    console.error(`❌ 目录不存在: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir);
  return files
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(dir, f))
    .sort();
}

async function getDefaultUser(prisma: PrismaClient) {
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
    console.log('创建默认用户:', user.id);
  }
  
  return user;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('用法: npx tsx scripts/batch-import-pdf.ts <PDF目录> [选项]');
    console.log('');
    console.log('选项:');
    console.log('  --env=prod|test    环境选择 (默认: prod)');
    console.log('  --grade=P3|P4|P5   年级 (默认: P4)');
    console.log('  --source=名称       题目来源');
    console.log('');
    process.exit(1);
  }
  
  const pdfDir = args[0];
  
  const options: ImportOptions = {
    environment: (args.find(a => a.startsWith('--env='))?.split('=')[1] as 'prod' | 'test') || 'prod',
    grade: (args.find(a => a.startsWith('--grade='))?.split('=')[1] as Grade) || 'P4',
    source: args.find(a => a.startsWith('--source='))?.split('=')[1] || 'PDF批量导入',
    autoMatchTags: true,
  };
  
  console.log('=================================');
  console.log('PDF批量导入工具 (RapidOCR)');
  console.log('=================================');
  console.log(`目录: ${pdfDir}`);
  console.log(`环境: ${options.environment}`);
  console.log(`年级: ${options.grade}`);
  console.log('');
  
  const pdfFiles = listPDFFiles(pdfDir);
  
  if (pdfFiles.length === 0) {
    console.log('没有找到PDF文件');
    process.exit(1);
  }
  
  console.log(`找到 ${pdfFiles.length} 个PDF文件:`);
  pdfFiles.forEach((f, i) => {
    const stats = fs.statSync(f);
    console.log(`  ${i + 1}. ${path.basename(f)} (${(stats.size / 1024).toFixed(1)} KB)`);
  });
  
  const prisma = createPrismaClient(options.environment);
  const user = await getDefaultUser(prisma);
  
  const outputDir = './uploads/ocr';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalQuestions = 0;
  
  for (const pdfFile of pdfFiles) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`处理: ${path.basename(pdfFile)}`);
    console.log('='.repeat(60));
    
    try {
      const result = await processPDF(pdfFile, outputDir, {
        model: 'mobile',
        dpi: 200,
      });

      if (!result.success) {
        console.log(`  ❌ OCR失败: ${result.error}`);
        continue;
      }

      const questions = result.questions || [];
      console.log(`  📄 ${result.pages} 页, ${questions.length} 道题目 (${result.elapsed?.toFixed(1)}s)`);
      totalQuestions += questions.length;

      if (questions.length === 0) continue;

      const ocrResults = questions.map((q, idx) => ({
        success: true as const,
        parsed: q,
        page: 1,
        questionNumber: idx + 1,
      }));

      const importResult = await smartImportFromOCR(ocrResults, user.id, {
        grade: options.grade,
        source: options.source,
        autoMatchTags: options.autoMatchTags,
      });

      totalSuccess += importResult.success;
      totalFailed += importResult.failed;
      console.log(`  ✅ 成功: ${importResult.success}, 失败: ${importResult.failed}`);
    } catch (error) {
      console.error(`  ❌ 处理失败:`, error);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('导入完成!');
  console.log('='.repeat(60));
  console.log(`处理文件: ${pdfFiles.length} 个`);
  console.log(`识别题目: ${totalQuestions} 道`);
  console.log(`成功导入: ${totalSuccess} 道`);
  console.log(`失败: ${totalFailed} 道`);
  
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('错误:', error);
  process.exit(1);
});
