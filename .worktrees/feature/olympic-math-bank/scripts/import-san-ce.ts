/**
 * 散测入学题目批量导入脚本
 *
 * 用法: npx tsx scripts/import-san-ce.ts
 *
 * 流程:
 *   1. 从 ZIP 解压到 data/san_ce_input/
 *   2. 运行 Python 脚本转换 .wmf → .png
 *   3. 复制所有图片到 public/uploads/san_ce/
 *   4. 创建散测专属知识标签树（模块→知识点 两级，隔离于原有五级树）
 *   5. 批量导入题目到 Question 表
 *   6. 建立题目与标签的关联
 */

import { PrismaClient, QuestionType, QuestionStatus, Grade } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { prisma } from '../lib/db/prisma';

const ZIP_PATH = path.join(
  process.env.USERPROFILE || '~',
  'Downloads',
  '散测最终录入.zip',
);
const INPUT_DIR = path.join(process.cwd(), 'data', 'san_ce_input');
const OUTPUT_IMG_DIR = path.join(process.cwd(), 'public', 'uploads', 'san_ce');

// ============================================================
// 工具函数
// ============================================================

/** 年级名称 → 数据库 Grade 枚举映射 */
function mapGrade(gradeName: string): Grade {
  const normalized = gradeName.replace(/[（(].*$/, '').trim();
  const map: Record<string, Grade> = {
    '1年级': 'P1', '新一年级': 'P1', '新1年级': 'P1', '新1年级（大升1）': 'P1',
    '2年级': 'P2', '新二年级': 'P2', '新2年级': 'P2', '新2年级（1升2）': 'P2',
    '3年级': 'P3', '新三年级': 'P3', '新3年级': 'P3', '新3年级（2升3）': 'P3',
    '4年级': 'P4', '新四年级': 'P4', '新4年级': 'P4',
    '5年级': 'P5', '新五年级': 'P5', '新5年级': 'P5', '新5年级（4升5）': 'P5',
    '6年级': 'P6', '新六年级': 'P6', '新6年级': 'P6', '新6年级（5升6）': 'P6',
  };
  return map[normalized] || 'P3';
}

/** 难度星级 → 1-5 数字 */
function mapDifficulty(stars: string): number {
  const count = (stars.match(/☆/g) || []).length;
  return Math.max(1, Math.min(5, count || 2));
}

/** 推断题型：基于题干内容 */
function inferQuestionType(content: string): QuestionType {
  const lower = content.toLowerCase();
  if (lower.includes('选择') || /[a-dA-D][\.、)）]/.test(content)) return 'CHOICE';
  if (lower.includes('填空') || content.includes('\\_\\_\\_\\_') || content.includes('___') || content.includes('____')) return 'FILL_BLANK';
  if (lower.includes('计算') || /[\+\-\×\÷\d]\s*[=＝]/.test(content)) return 'CALCULATION';
  return 'SOLUTION';
}

/** 获取源目录的名字（乱码直接读第一个子目录） */
function getZipContentDir(): string {
  const dirs = fs.readdirSync(INPUT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());
  if (dirs.length === 0) throw new Error('INPUT_DIR 下无子目录，请先解压 ZIP');
  return path.join(INPUT_DIR, dirs[0].name);
}

/** 递归找所有 .wmf 文件的第一条路径（用于测试时） */
function findFirstFile(dir: string, ext: string): string | null {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fp = path.join(dir, item.name);
    if (item.isFile() && fp.endsWith(ext)) return fp;
    if (item.isDirectory()) {
      const found = findFirstFile(fp, ext);
      if (found) return found;
    }
  }
  return null;
}

// ============================================================
// 步骤 1: 解压 ZIP
// ============================================================

function step1_extractZip(): void {
  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error(`ZIP 文件不存在: ${ZIP_PATH}`);
  }

  if (fs.existsSync(INPUT_DIR)) {
    console.log('[1/6] INPUT_DIR 已存在，跳过解压');
    return;
  }

  console.log('[1/6] 解压 ZIP...');
  fs.mkdirSync(INPUT_DIR, { recursive: true });

  if (process.platform === 'win32') {
    execSync(
      `powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${INPUT_DIR}' -Force"`,
      { stdio: 'inherit' },
    );
  } else {
    execSync(`unzip -o "${ZIP_PATH}" -d "${INPUT_DIR}"`, { stdio: 'inherit' });
  }
  console.log('  解压完成');
}

// ============================================================
// 步骤 2: 转换 .wmf → .png
// ============================================================

function step2_convertWmf(): void {
  const contentDir = getZipContentDir();
  const imagesDir = path.join(contentDir, 'images');

  if (!fs.existsSync(imagesDir)) {
    console.log('[2/6] images 目录不存在，跳过 wmf 转换');
    return;
  }

  // 检查是否有 .wmf 文件
  const firstWmf = findFirstFile(imagesDir, '.wmf');
  if (!firstWmf) {
    console.log('[2/6] 无 .wmf 文件，跳过转换');
    return;
  }

  console.log('[2/6] 转换 .wmf → .png ...');
  try {
    execSync(`python scripts/convert_wmf_to_png.py "${imagesDir}"`, {
      stdio: 'inherit',
      timeout: 300000,
    });
  } catch (e) {
    console.warn('  wmf 转换出错（可能部分文件失败），继续导入...');
  }
}

// ============================================================
// 步骤 3: 复制图片到 public/
// ============================================================

function step3_copyImages(): void {
  console.log('[3/6] 复制图片到 public/ ...');
  const contentDir = getZipContentDir();
  const srcImagesDir = path.join(contentDir, 'images');

  if (!fs.existsSync(srcImagesDir)) {
    console.log('  无 images 目录，跳过');
    return;
  }

  if (fs.existsSync(OUTPUT_IMG_DIR)) {
    console.log('  OUTPUT_IMG_DIR 已存在，跳过复制');
    return;
  }

  // 递归复制
  fs.mkdirSync(OUTPUT_IMG_DIR, { recursive: true });
  execSync(
    process.platform === 'win32'
      ? `robocopy "${srcImagesDir}" "${OUTPUT_IMG_DIR}" /E /NJH /NJS /NP /NDL /NFL 2>NUL || exit 0`
      : `cp -r "${srcImagesDir}/." "${OUTPUT_IMG_DIR}/"`,
    { stdio: 'ignore' },
  );
  console.log('  复制完成');
}

// ============================================================
// 步骤 4: 创建散测专属知识标签树
// ============================================================

/** 构建 模块→知识点 的层级 */
interface TagEntry {
  module: string;
  knowledge: string;
}

async function step4_createKnowledgeTags(data: any[]): Promise<Map<string, string>> {
  console.log('[4/6] 创建散测专属知识标签树 ...');

  // 收集所有 模块+知识点 组合
  const tagSet = new Map<string, TagEntry>();
  for (const q of data) {
    const module = (q['模块'] || '未分类').trim();
    const knowledge = (q['知识点'] || '').trim();
    if (!module) continue;
    const key = `${module}|||${knowledge}`;
    if (!tagSet.has(key)) {
      tagSet.set(key, { module, knowledge });
    }
  }
  console.log(`  共 ${tagSet.size} 个独特标签组合`);

  // 确保顶级"散测入学"模块存在
  const ROOT_MODULE = '散测入学';

  // 先查找或创建各模块（作为二级，parent 为散测入学）
  const moduleCache = new Map<string, string>(); // 模块名 → tagId
  const knowledgeCache = new Map<string, string>(); // 模块|||知识点 → tagId

  for (const [key, { module, knowledge }] of tagSet) {
    // 创建模块级标签
    if (!moduleCache.has(module)) {
      const code = `${ROOT_MODULE}-${module}`;
      const existing = await prisma.knowledgeTag.findFirst({
        where: { code },
      });
      if (existing) {
        moduleCache.set(module, existing.id);
      } else {
        const created = await prisma.knowledgeTag.create({
          data: {
            level: 2,
            name: module,
            code,
            namespace: '散测入学',
            module: ROOT_MODULE,
            topic: module,
          },
        });
        moduleCache.set(module, created.id);
      }
    }

    // 创建知识点级标签
    const knowledgeCode = `${ROOT_MODULE}-${module}-${knowledge || '通用'}`;
    const existingK = await prisma.knowledgeTag.findFirst({
      where: { code: knowledgeCode },
    });
    if (existingK) {
      knowledgeCache.set(key, existingK.id);
    } else {
      const created = await prisma.knowledgeTag.create({
        data: {
          level: 3,
          name: knowledge || `${module}-通用`,
          code: knowledgeCode,
          namespace: '散测入学',
          module: ROOT_MODULE,
          topic: module,
          subtopic: knowledge || module,
          parentId: moduleCache.get(module) || null,
        },
      });
      knowledgeCache.set(key, created.id);
    }
  }

  console.log(`  模块数: ${moduleCache.size}, 知识点数: ${knowledgeCache.size}`);
  return knowledgeCache;
}

// ============================================================
// 步骤 5: 导入题目
// ============================================================

type QuestionRecord = Record<string, string>;

async function step5_importQuestions(
  data: QuestionRecord[],
  tagCache: Map<string, string>,
): Promise<void> {
  console.log(`[5/6] 导入 ${data.length} 道题目 ...`);

  // 找到默认管理员用户
  const admin = await prisma.user.findFirst({
    where: { phone: '13704592025' },
  });
  if (!admin) throw new Error('未找到管理员用户，请先运行 seed');

  let imported = 0;
  let skipped = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);

    for (const q of batch) {
      const content = (q['题干'] || '').trim();
      if (!content) {
        skipped++;
        continue;
      }

      try {
        // 映射字段
        const type = inferQuestionType(content);
        const grade = mapGrade(q['年级']);
        const difficulty = mapDifficulty(q['难度星级']);
        const source = `散测入学-${q['时间']}-${q['年级']}`;
        const answer = (q['答案'] || '').trim();
        const solution = (q['解析'] || '').trim();

        // 处理图片路径：将 images/ 开头的路径重写为 /uploads/san_ce/
        function rewriteImagePath(raw: string): string {
          if (!raw || !raw.trim()) return '';
          return raw
            .split(';')
            .map(p => p.trim())
            .filter(Boolean)
            .map(p => {
              // 将 .wmf 后缀替换为 .png（转换后）
              const normalized = p.replace(/\.wmf$/i, '.png');
              // 提取 images/ 之后的相对路径
              const idx = normalized.indexOf('images/');
              if (idx >= 0) {
                return `/uploads/san_ce/${normalized.substring(idx + 'images/'.length)}`;
              }
              return normalized;
            })
            .join(';');
        }

        const stemImages = rewriteImagePath(q['题图']);
        const analysisImages = rewriteImagePath(q['解析题图']);
        const answerImages = rewriteImagePath(q['答案图片']);

        // 合并所有图片到 content 中（以 Markdown image 语法）
        let fullContent = content;
        if (stemImages) {
          const imgs = stemImages.split(';').map(p => `![](${p})`).join('\n');
          fullContent += '\n' + imgs;
        }

        // 答案中附加答案图片
        let fullAnswer = answer;
        if (answerImages) {
          const imgs = answerImages.split(';').map(p => `![](${p})`).join('\n');
          fullAnswer += '\n' + imgs;
        }

        // 解析中附加解析图片
        let fullSolution = solution;
        if (analysisImages) {
          const imgs = analysisImages.split(';').map(p => `![](${p})`).join('\n');
          fullSolution += '\n' + imgs;
        }

        // 确定标签 ID
        const module = (q['模块'] || '未分类').trim();
        const knowledge = (q['知识点'] || '').trim();
        const tagKey = `${module}|||${knowledge}`;
        const tagId = tagCache.get(tagKey);

        // 创建题目
        const created = await prisma.question.create({
          data: {
            content: fullContent,
            answer: fullAnswer,
            solution: fullSolution || null,
            type,
            grade,
            difficulty,
            source,
            status: QuestionStatus.DRAFT,
            createdById: admin.id,
          },
        });

        // 关联知识标签（直接设置 knowledgeTagId）
        if (tagId) {
          await prisma.question.update({
            where: { id: created.id },
            data: { knowledgeTagId: tagId },
          });
        }

        imported++;
      } catch (err) {
        console.error(`  导入失败 [${q.hash_id}]:`, err instanceof Error ? err.message : err);
        skipped++;
      }
    }

    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= data.length) {
      console.log(`  进度: ${Math.min(i + BATCH_SIZE, data.length)}/${data.length} (成功 ${imported}, 跳过 ${skipped})`);
    }
  }

  console.log(`  导入完成: ${imported} 成功, ${skipped} 跳过`);
}

// ============================================================
// 步骤 6: 验证
// ============================================================

async function step6_verify(): Promise<void> {
  console.log('[6/6] 验证导入结果 ...');
  const count = await prisma.question.count({
    where: { source: { startsWith: '散测入学' } },
  });
  console.log(`  散测入学题目总数: ${count}`);

  const tagCount = await prisma.knowledgeTag.count({
    where: { module: '散测入学' },
  });
  console.log(`  散测入学标签总数: ${tagCount}`);
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('=== 散测入学题目批量导入 ===\n');

  try {
    step1_extractZip();
  } catch (e) {
    console.error('步骤1失败:', e);
    process.exit(1);
  }

  try {
    step2_convertWmf();
  } catch (e) {
    console.warn('步骤2失败（非致命）:', e instanceof Error ? e.message : e);
  }

  try {
    step3_copyImages();
  } catch (e) {
    console.error('步骤3失败:', e);
    process.exit(1);
  }

  // 读取 JSON
  const contentDir = getZipContentDir();
  const jsonPath = path.join(contentDir, 'questions.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`JSON 文件不存在: ${jsonPath}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as QuestionRecord[];
  console.log(`\n读取到 ${rawData.length} 道题目\n`);

  // 步骤 4: 创建标签树
  const tagCache = await step4_createKnowledgeTags(rawData);

  // 步骤 5: 导入题目
  await step5_importQuestions(rawData, tagCache);

  // 步骤 6: 验证
  await step6_verify();

  console.log('\n=== 导入完成 ===');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('导入失败:', e);
  process.exit(1);
});
