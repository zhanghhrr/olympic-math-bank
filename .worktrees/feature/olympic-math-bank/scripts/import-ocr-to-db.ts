/**
 * OCR 结果导入数据库脚本
 * 用法: npx tsx scripts/import-ocr-to-db.ts <ocr_result.json> [options]
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

interface OCRResult {
  success: boolean;
  parsed?: {
    title?: string;
    content: string;
    options: string[];
    answer?: string;
    solution?: string;
    type: string;
    formulas?: string[];
  };
  page?: number;
  raw?: any;
}

async function importOCRToDB(
  filePath: string,
  options: {
    userId: string;
    grade?: string;
    source?: string;
    dryRun?: boolean;
  }
) {
  console.log(`📄 读取文件: ${filePath}`);

  // 读取 JSON 文件
  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content);

  // 提取结果
  let results: OCRResult[] = [];
  if (data.results && Array.isArray(data.results)) {
    results = data.results;
  } else if (Array.isArray(data)) {
    results = data;
  } else if (data.parsed) {
    results = [data];
  }

  console.log(`📊 共 ${results.length} 页识别结果`);

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
    const questionType = parsed.options.length > 0 ? 'SINGLE_CHOICE' : 'SOLUTION';

    // 处理选项
    let optionsJson: string | undefined;
    if (parsed.options.length > 0) {
      const optionsMap: Record<string, string> = {};
      parsed.options.forEach((opt: string, index: number) => {
        const label = String.fromCharCode(65 + index);
        const content = opt.replace(/^[A-F][\.、\s]*/, '').trim();
        optionsMap[label] = content;
      });
      optionsJson = JSON.stringify(optionsMap);
    }

    try {
      if (!options.dryRun) {
        // 创建题目
        const question = await prisma.question.create({
          data: {
            content: parsed.content,
            answer: parsed.answer || '',
            solution: parsed.solution || null,
            type: questionType as any,
            options: optionsJson,
            grade: (options.grade || 'P3') as any,
            difficulty: 3,
            source: options.source || `OCR导入-第${result.page || '?'}页`,
            status: 'PENDING',
            createdById: options.userId,
          }
        });

        console.log(`✅ 第 ${result.page || '?'} 页导入成功: ${question.id}`);
        imported++;
      } else {
        console.log(`📝 [预览] 第 ${result.page || '?'} 页: ${parsed.content.substring(0, 50)}...`);
        imported++;
      }
    } catch (error: any) {
      console.error(`❌ 第 ${result.page || '?'} 页导入失败:`, error.message);
      failed++;
    }
  }

  console.log('\n📈 导入结果:');
  console.log(`  - 成功: ${imported}`);
  console.log(`  - 失败: ${failed}`);
  console.log(`  - 总计: ${results.length}`);

  if (!options.dryRun) {
    console.log('\n💡 提示: 导入的题目状态为"待审核",请前往审核页面进行审核');
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('用法: npx tsx scripts/import-ocr-to-db.ts <ocr_result.json> [options]');
    console.log('');
    console.log('选项:');
    console.log('  --user-id <id>     用户ID (必需)');
    console.log('  --grade <grade>    年级 (P1-P6, 默认: P3)');
    console.log('  --source <source>  来源说明');
    console.log('  --dry-run          预览模式，不实际导入');
    console.log('');
    console.log('示例:');
    console.log('  npx tsx scripts/import-ocr-to-db.ts ocr_result.json --user-id abc123 --grade P3');
    process.exit(1);
  }

  const filePath = args[0];

  // 解析选项
  const options: any = {
    grade: 'P3'
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--user-id':
        options.userId = args[++i];
        break;
      case '--grade':
        options.grade = args[++i];
        break;
      case '--source':
        options.source = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
    }
  }

  if (!options.userId) {
    console.error('错误: 请提供 --user-id');
    process.exit(1);
  }

  try {
    await importOCRToDB(filePath, options);
  } catch (error: any) {
    console.error('导入失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
