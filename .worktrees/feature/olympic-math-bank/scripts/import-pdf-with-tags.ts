/**
 * PDF导入脚本（带自动标签匹配）
 * 支持选择目录下的PDF文件进行导入
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { PrismaClient, Grade } from '@prisma/client';

const prisma = new PrismaClient();

// 配置 - 请修改为实际的PDF目录路径
const PDF_DIR = process.env.PDF_IMPORT_DIR || './uploads';

interface PDFImportOptions {
  grade?: Grade;
  source?: string;
  environment?: 'prod' | 'test';
  autoMatchTags?: boolean;
}

/**
 * 列出目录下的PDF文件
 */
function listPDFFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    console.error(`目录不存在: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir);
  return files
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(dir, f));
}

/**
 * 交互式选择文件
 */
async function selectFiles(files: string[]): Promise<string[]> {
  if (files.length === 0) {
    console.log('没有找到PDF文件');
    return [];
  }

  console.log('\n找到以下PDF文件：\n');
  files.forEach((file, index) => {
    const stats = fs.statSync(file);
    const size = (stats.size / 1024).toFixed(1);
    console.log(`  ${index + 1}. ${path.basename(file)} (${size} KB)`);
  });

  console.log('\n选项：');
  console.log('  a. 导入所有文件');
  console.log('  数字. 选择单个文件（如：1）');
  console.log('  数字范围. 选择多个文件（如：1-3）');
  console.log('  q. 退出\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('请选择: ', (answer) => {
      rl.close();

      if (answer.toLowerCase() === 'q') {
        resolve([]);
        return;
      }

      if (answer.toLowerCase() === 'a') {
        resolve(files);
        return;
      }

      // 处理范围选择（如：1-3）
      if (answer.includes('-')) {
        const [start, end] = answer.split('-').map(n => parseInt(n.trim()) - 1);
        if (!isNaN(start) && !isNaN(end)) {
          resolve(files.slice(start, end + 1));
          return;
        }
      }

      // 处理单个选择
      const index = parseInt(answer) - 1;
      if (!isNaN(index) && index >= 0 && index < files.length) {
        resolve([files[index]]);
        return;
      }

      console.log('无效选择');
      resolve([]);
    });
  });
}

/**
 * 模拟OCR处理（实际项目中应调用MinerU API）
 */
async function processPDF(filePath: string): Promise<any> {
  console.log(`\n处理文件: ${path.basename(filePath)}`);
  console.log('  [OCR] 识别中...');

  // 模拟OCR处理延迟
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 根据文件名推断题目类型和知识点
  const fileName = path.basename(filePath);
  let detectedTags: string[] = [];
  let content = '';

  if (fileName.includes('一半模型')) {
    content = '一半模型相关题目';
    detectedTags = ['一半模型', '几何面积'];
  } else if (fileName.includes('三角形数表')) {
    content = '三角形数表相关题目';
    detectedTags = ['三角形数表', '数列'];
  } else if (fileName.includes('方程')) {
    content = '列方程解应用题';
    detectedTags = ['方程', '应用题'];
  } else if (fileName.includes('相遇') || fileName.includes('追及')) {
    content = '行程问题';
    detectedTags = ['行程问题', '相遇问题', '追及问题'];
  } else if (fileName.includes('质数')) {
    content = '质数与合数';
    detectedTags = ['质数', '合数', '数论'];
  } else if (fileName.includes('分解质因数')) {
    content = '分解质因数';
    detectedTags = ['分解质因数', '质因数'];
  } else if (fileName.includes('排列组合')) {
    content = '排列组合进阶';
    detectedTags = ['排列', '组合', '计数'];
  } else if (fileName.includes('最值')) {
    content = '最值问题';
    detectedTags = ['最值问题'];
  }

  console.log(`  [OCR] 识别完成`);
  console.log(`  [分析] 检测到知识点: ${detectedTags.join(', ')}`);

  // 模拟识别到3道题目
  const questions = [];
  for (let i = 1; i <= 3; i++) {
    questions.push({
      success: true,
      parsed: {
        title: `例题${i}`,
        content: `${content} - 第${i}题\n这里是题目内容...`,
        answer: `答案${i}`,
        analysis: `解析${i}`,
      },
      detectedTags,
    });
  }

  return {
    success: true,
    questions,
  };
}

/**
 * 匹配知识标签
 */
async function matchKnowledgeTags(detectedTags: string[]): Promise<string[]> {
  const matchedIds: string[] = [];

  for (const tagName of detectedTags) {
    const tags = await prisma.knowledgeTag.findMany({
      where: {
        name: { contains: tagName },
      },
      take: 5,
    });

    for (const tag of tags) {
      if (!matchedIds.includes(tag.id)) {
        matchedIds.push(tag.id);
      }
    }
  }

  return matchedIds;
}

/**
 * 导入题目到数据库
 */
async function importQuestions(
  ocrResults: any[],
  userId: string,
  options: PDFImportOptions
): Promise<{ success: number; failed: number; tags: number }> {
  let success = 0;
  let failed = 0;
  let totalTags = 0;

  for (const result of ocrResults) {
    if (!result.success) {
      failed++;
      continue;
    }

    for (const question of result.questions) {
      try {
        // 匹配知识标签
        const tagIds = await matchKnowledgeTags(question.detectedTags);
        totalTags += tagIds.length;

        // 创建题目
        const created = await prisma.question.create({
          data: {
            content: question.parsed.content,
            answer: question.parsed.answer || '',
            solution: question.parsed.analysis || '',
            type: 'SOLUTION',
            grade: options.grade || 'P4',
            difficulty: 3,
            source: options.source || 'PDF导入',
            status: 'DRAFT',
            createdById: userId,
            knowledgeTagId: tagIds[0] || null,
          },
        });

        console.log(`    ✓ 题目 ${created.id.substring(0, 8)}... 已导入 (${tagIds.length} 个标签)`);
        success++;
      } catch (error) {
        console.log(`    ✗ 导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
        failed++;
      }
    }
  }

  return { success, failed, tags: totalTags };
}

/**
 * 获取或创建默认用户
 */
async function getDefaultUser() {
  let user = await prisma.user.findFirst({
    where: { phone: '13704592025' },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone: '13704592025',
        name: '管理员',
        role: 'ADMIN',
      },
    });
    console.log('创建默认用户:', user.id);
  }

  return user;
}

/**
 * 主函数
 */
async function main() {
  console.log('=================================');
  console.log('PDF导入工具（带自动标签匹配）');
  console.log('=================================\n');

  // 选择环境
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const envAnswer = await new Promise<string>((resolve) => {
    rl.question('选择环境 (1-生产环境, 2-测试环境): ', resolve);
  });

  const environment = envAnswer === '2' ? 'test' : 'prod';
  const dbPath = environment === 'test' ? 'file:./lib/db/test.db' : 'file:./lib/db/dev.db';

  // 重新初始化Prisma客户端
  await prisma.$disconnect();
  process.env.DATABASE_URL = dbPath;

  console.log(`\n使用${environment === 'test' ? '测试' : '生产'}环境数据库`);

  // 列出PDF文件
  const pdfFiles = listPDFFiles(PDF_DIR);

  if (pdfFiles.length === 0) {
    console.log('没有找到PDF文件');
    rl.close();
    return;
  }

  // 选择文件
  const selectedFiles = await selectFiles(pdfFiles);

  if (selectedFiles.length === 0) {
    console.log('未选择文件，退出');
    rl.close();
    return;
  }

  console.log(`\n已选择 ${selectedFiles.length} 个文件`);

  // 获取默认用户
  const user = await getDefaultUser();

  // 处理每个文件
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalTags = 0;

  for (const filePath of selectedFiles) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`处理: ${path.basename(filePath)}`);
    console.log('='.repeat(50));

    // OCR处理
    const ocrResult = await processPDF(filePath);

    if (!ocrResult.success) {
      console.log('OCR处理失败，跳过');
      continue;
    }

    // 导入数据库
    const result = await importQuestions(ocrResult.questions, user.id, {
      grade: 'P4',
      source: path.basename(filePath),
      environment,
    });

    totalSuccess += result.success;
    totalFailed += result.failed;
    totalTags += result.tags;
  }

  // 总结
  console.log(`\n${'='.repeat(50)}`);
  console.log('导入完成！');
  console.log('='.repeat(50));
  console.log(`成功: ${totalSuccess} 题`);
  console.log(`失败: ${totalFailed} 题`);
  console.log(`标签匹配: ${totalTags} 次`);

  rl.close();
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('错误:', error);
  process.exit(1);
});
