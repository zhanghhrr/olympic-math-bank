/**
 * OCR 结果导入数据库脚本
 * 用法: npx tsx scripts/import-ocr-to-db.ts <ocr_result.json> [options]
 *
 * 底层复用 lib/ocr/import-to-db.ts 的 smartImportFromOCR()，
 * 确保公式校验、自动打标签、题号剥离等逻辑与 API 导入路径一致。
 */

import fs from 'fs/promises';
import path from 'path';
import { smartImportFromOCR } from '../lib/ocr/import-to-db';
import type { ParsedQuestion } from '../lib/ocr/mineru-client';

interface OCRResultItem {
  success: boolean;
  parsed?: {
    title?: string;
    content: string;
    options?: string[];
    answer?: string;
    analysis?: string;
    solution?: string;
    type?: string;
    formulas?: string;
    sourceBlocks?: string;
  };
  page?: number;
  questionNumber?: number;
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
  let results: OCRResultItem[] = [];
  if (data.results && Array.isArray(data.results)) {
    results = data.results;
  } else if (Array.isArray(data)) {
    results = data;
  } else if (data.parsed) {
    results = [data];
  }

  console.log(`📊 共 ${results.length} 条识别结果`);

  if (options.dryRun) {
    console.log('📝 [预览模式] 不实际导入数据库\n');
    for (const result of results) {
      if (!result.success || !result.parsed) {
        console.log(`⚠️  跳过第 ${result.page || '?'} 页: 识别失败`);
        continue;
      }
      const p = result.parsed;
      if (!p.content || p.content.length < 10) {
        console.log(`⚠️  跳过第 ${result.page || '?'} 页: 内容过短`);
        continue;
      }
      console.log(`📝 第 ${result.page || '?'} 页: ${p.content.substring(0, 80)}...`);
    }
    console.log(`\n预览完成: ${results.length} 条记录`);
    return;
  }

  // 使用统一的 smartImportFromOCR 导入（含公式校验、自动打标签、题号剥离）
  const parsedQuestions = results.map((r) => {
    const p = r.parsed;
    if (!r.success || !p) {
      return {
        success: false as const,
        error: 'OCR识别失败',
        page: r.page,
        questionNumber: r.questionNumber,
      };
    }
    return {
      success: true as const,
      parsed: {
        title: p.title,
        content: p.content,
        answer: p.answer || p.solution || '',
        analysis: p.analysis || '',
        formulas: p.formulas || null,
        sourceBlocks: p.sourceBlocks || null,
      } as ParsedQuestion,
      page: r.page,
      questionNumber: r.questionNumber,
    };
  });

  const result = await smartImportFromOCR(parsedQuestions, options.userId, {
    grade: (options.grade as any) || 'P3',
    source: options.source || path.basename(filePath),
    autoMatchTags: true,
  });

  console.log('\n📈 导入结果:');
  console.log(`  - 成功: ${result.success}`);
  console.log(`  - 失败: ${result.failed}`);
  console.log(`  - 总计: ${result.total}`);

  if (result.success > 0) {
    console.log('\n💡 提示: 导入的题目状态为"草稿", 可在题库管理页面查看');
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
  }
}

main();
