/**
 * 散测卷批量 OCR 识别脚本
 *
 * 用法: $env:MINERU_API_TOKEN="<TOKEN>"; npx tsx scripts/ocr-san-ce-batch.ts
 *
 * 流程:
 *   阶段1: 扫描散测卷目录，匹配学生版+教师版 PDF 对
 *   阶段2: 逐对调用 MinerU API 进行 OCR 识别
 *   阶段3: 题目拆分 - 学生版提取题干，教师版提取答案/解析/模块/知识点/难度
 *   阶段4: 图片处理 - 从 MinerU 输出提取图片，按 hash_id 分目录存放
 *   阶段5: 输出 questions.json + questions.csv + images/
 *
 * 特性:
 *   - 断点续跑：已处理的 PDF 对自动跳过
 *   - SHA256 缓存：同一 PDF 不会重复调用 MinerU API（mineru-client 内置）
 *   - 子目录跳过：忽略 旧版/、原版/、错误/ 等版本管理目录
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { processPDF, type MinerUResult, type ParsedQuestion } from '../lib/ocr/mineru-client';
import { HybridQuestionIdentifier } from '../lib/ocr/question-identifier';

// ============================================================
// 配置
// ============================================================

const CONFIG = {
  INPUT_DIR: path.join(
    process.env.USERPROFILE || 'C:\\Users\\Twilight',
    'Downloads',
    '散测卷',
  ),
  OUTPUT_DIR: path.join(
    process.env.USERPROFILE || 'C:\\Users\\Twilight',
    'Downloads',
    '散测卷_ocr_output',
  ),
  /** 需要跳过的子目录名（版本管理目录） */
  SKIP_DIRS: new Set([
    '旧版', '旧', '原版', '错误',
    '5年级旧版',
    '更新8月添加A预备标签',
    '2025年8月二升三（新三年级）散测', // 这是嵌套的 zip 解压目录
  ]),
  /** MinerU 单文件处理超时（ms） */
  POLL_TIMEOUT_MS: 600000,
};

// ============================================================
// 命令行参数解析（token 已在文件顶部预解析到环境变量中）
// ============================================================

function getToken(): string {
  const token = process.env.MINERU_API_TOKEN || '';
  if (!token) {
    console.error('错误: 未提供 MinerU API Token');
    console.error('用法: $env:MINERU_API_TOKEN="<TOKEN>"; npx tsx scripts/ocr-san-ce-batch.ts');
    console.error('  或 npx tsx scripts/ocr-san-ce-batch.ts --token <TOKEN>');
    process.exit(1);
  }
  return token;
}

// ============================================================
// 类型定义
// ============================================================

interface PdfPair {
  /** 年月目录名，如 "202507" */
  yearMonth: string;
  /** 年级目录名，如 "新三年级" */
  gradeDir: string;
  /** 年级显示名，如 "新三年级" */
  gradeName: string;
  /** 时间显示名，如 "2025年7月" */
  timeName: string;
  /** 学生版 PDF 绝对路径 */
  studentPdf: string;
  /** 教师版 PDF 绝对路径 */
  teacherPdf: string;
  /** 学生版文件名 */
  studentFileName: string;
  /** 教师版文件名 */
  teacherFileName: string;
}

interface ExtractedMeta {
  /** 模块（如 "校内计算"、"应用题模块"） */
  module: string;
  /** 知识点（如 "大数加减"、"间隔问题"） */
  knowledge: string;
  /** 难度星级（如 "☆"、"☆☆☆"） */
  difficulty: string;
}

interface OutputQuestion {
  hash_id: string;
  年级: string;
  时间: string;
  题号: string;
  题干: string;
  题图: string;
  解析题图: string;
  答案: string;
  答案图片: string;
  解析: string;
  模块: string;
  知识点: string;
  难度星级: string;
  source_folder: string;
  student_file: string;
  teacher_file: string;
  needs_review: string;
}

interface ProgressData {
  completedPairs: string[];  // "yearMonth/gradeDir" 格式
  totalQuestions: number;
}

// ============================================================
// 工具函数
// ============================================================

const questionIdentifier = new HybridQuestionIdentifier();

/** 生成唯一 hash_id */
function generateHashId(gradeName: string, timeName: string, questionNumber: string): string {
  const raw = `${gradeName}-${timeName}-${questionNumber}`;
  return crypto.createHash('md5').update(raw).digest('hex').substring(0, 16);
}

/** 年月目录名 → 时间显示名 */
function yearMonthToTime(dirName: string): string {
  // "202507" → "2025年7月"
  const m = dirName.match(/^(\d{4})(\d{2})$/);
  if (m) return `${m[1]}年${parseInt(m[2])}月`;
  return dirName;
}

/** 年级目录名 → 标准化年级名（保留原名用于显示） */
function normalizeGradeName(raw: string): string {
  // 去除括号内容后的纯文本
  let name = raw.trim();
  // 处理 "新五年级（7.25更新）" 等
  name = name.replace(/[（(].*$/, '').trim();
  return name;
}

/** 检查目录是否应该跳过（仅精确匹配 SKIP_DIRS 中的名称） */
function shouldSkipDir(dirName: string): boolean {
  return CONFIG.SKIP_DIRS.has(dirName);
}

// ============================================================
// 阶段1: 扫描配对
// ============================================================

function scanPdfPairs(): PdfPair[] {
  console.log('[阶段1] 扫描 PDF 配对...\n');

  if (!fs.existsSync(CONFIG.INPUT_DIR)) {
    throw new Error(`输入目录不存在: ${CONFIG.INPUT_DIR}`);
  }

  const pairs: PdfPair[] = [];
  const yearMonthDirs = fs.readdirSync(CONFIG.INPUT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort();

  for (const ymDir of yearMonthDirs) {
    const ymPath = path.join(CONFIG.INPUT_DIR, ymDir.name);
    const gradeDirs = fs.readdirSync(ymPath, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const gDir of gradeDirs) {
      const gradePath = path.join(ymPath, gDir.name);

      // 跳过版本管理目录
      if (shouldSkipDir(gDir.name)) {
        console.log(`  跳过: ${ymDir.name}/${gDir.name} (版本管理目录)`);
        continue;
      }

      // 收集所有有效 PDF 路径（当前目录 + 非跳过的子目录，递归最多 3 层）
      const pdfSources: Array<{ dirPath: string; dirLabel: string }> = [];

      // 递归查找含 PDF 的目录
      function collectPdfDirs(currentPath: string, currentLabel: string, depth: number) {
        if (depth > 3) return; // 最多递归3层

        const rootPdfs = fs.readdirSync(currentPath)
          .filter(f => f.toLowerCase().endsWith('.pdf'));
        if (rootPdfs.length > 0) {
          pdfSources.push({ dirPath: currentPath, dirLabel: currentLabel });
          return; // 找到 PDF 后不再深入子目录
        }

        // 无 PDF，检查子目录
        const subDirs = fs.readdirSync(currentPath, { withFileTypes: true })
          .filter(d => d.isDirectory() && !shouldSkipDir(d.name));
        for (const subDir of subDirs) {
          collectPdfDirs(
            path.join(currentPath, subDir.name),
            currentLabel ? `${currentLabel}/${subDir.name}` : subDir.name,
            depth + 1,
          );
        }
      }

      collectPdfDirs(gradePath, gDir.name, 0);

      if (pdfSources.length === 0) {
        console.log(`  跳过: ${ymDir.name}/${gDir.name} (无 PDF 文件)`);
        continue;
      }

      // 为每个有效源配对
      for (const source of pdfSources) {
        const files = fs.readdirSync(source.dirPath)
          .filter(f => f.toLowerCase().endsWith('.pdf'));

        const studentPdfs = files.filter(f =>
           f.includes('学生版') || f.includes('(学生版)') || f.includes('（学生版）') ||
           // 兼容无版本标记的文件名（既无"学生版"也无"教师版"也不含"答案" → 视作学生版）
           (!f.includes('教师版') && !f.includes('(教师版)') && !f.includes('（教师版）') &&
            !f.includes('答案版') && !f.includes('(答案版)') && !f.includes('（答案版）') &&
            !f.includes('答案'))
         );
         const teacherPdfs = files.filter(f =>
           f.includes('教师版') || f.includes('(教师版)') || f.includes('（教师版）') ||
           f.includes('答案版') || f.includes('(答案版)') || f.includes('（答案版）') ||
           f.includes('答案')
         );

        if (studentPdfs.length === 0) {
           console.log(`  警告: ${ymDir.name}/${source.dirLabel} 缺少学生版 PDF`);
           continue;
         }
         let teacherDirPath = source.dirPath;
         if (teacherPdfs.length === 0) {
           // 在当前目录的父目录下查找 原版/ 或 旧版/ 子目录中的教师版 PDF
           const parentDir = path.dirname(source.dirPath);
           for (const fallbackDirName of ['原版', '旧版', '旧']) {
             const fallbackDir = path.join(parentDir, fallbackDirName);
             if (fs.existsSync(fallbackDir)) {
               const fallbackFiles = fs.readdirSync(fallbackDir)
                 .filter(f => f.toLowerCase().endsWith('.pdf'));
               const fallbackTeachers = fallbackFiles.filter(f =>
                 f.includes('教师版') || f.includes('(教师版)') || f.includes('（教师版）') ||
                 f.includes('答案版') || f.includes('(答案版)') || f.includes('（答案版）') ||
                 f.includes('答案')
               ).sort();
               if (fallbackTeachers.length > 0) {
                 teacherDirPath = fallbackDir;
                 // 重新设置 teacherPdfs（从 fallback 目录）
                 teacherPdfs.length = 0;
                 teacherPdfs.push(...fallbackTeachers);
                 console.log(`  ${ymDir.name}/${source.dirLabel}: 教师版从 [${fallbackDirName}] 目录使用`);
                 break;
               }
             }
           }
           if (teacherPdfs.length === 0) {
             console.log(`  警告: ${ymDir.name}/${source.dirLabel} 缺少教师版 PDF（含原版/旧版回退）`);
             continue;
           }
         }

        studentPdfs.sort();
        teacherPdfs.sort();

        const count = Math.min(studentPdfs.length, teacherPdfs.length);
        for (let i = 0; i < count; i++) {
          pairs.push({
            yearMonth: ymDir.name,
            gradeDir: source.dirLabel,
            gradeName: normalizeGradeName(gDir.name),
            timeName: yearMonthToTime(ymDir.name),
            studentPdf: path.join(source.dirPath, studentPdfs[i]),
            teacherPdf: path.join(teacherDirPath, teacherPdfs[i]),
            studentFileName: studentPdfs[i],
            teacherFileName: teacherPdfs[i],
          });
        }

        console.log(`  ${ymDir.name}/${source.dirLabel}: ${count} 对`);
      }
    }
  }

  console.log(`\n共发现 ${pairs.length} 对 PDF\n`);
  return pairs;
}

// ============================================================
// 阶段2: MinerU OCR 处理
// ============================================================

function getPairKey(pair: PdfPair): string {
  return `${pair.yearMonth}/${pair.gradeDir}`;
}

function loadProgress(): ProgressData {
  const progressPath = path.join(CONFIG.OUTPUT_DIR, 'progress.json');
  if (fs.existsSync(progressPath)) {
    try {
      return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    } catch {
      // ignore
    }
  }
  return { completedPairs: [], totalQuestions: 0 };
}

function saveProgress(progress: ProgressData): void {
  const progressPath = path.join(CONFIG.OUTPUT_DIR, 'progress.json');
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
}

async function processPdfPair(
  pair: PdfPair,
  pairIndex: number,
  totalPairs: number,
): Promise<{ success: boolean; studentResult?: MinerUResult; teacherResult?: MinerUResult }> {
  const pairKey = getPairKey(pair);
  console.log(`\n[${pairIndex + 1}/${totalPairs}] ${pairKey}`);
  console.log(`  学生版: ${pair.studentFileName}`);
  console.log(`  教师版: ${pair.teacherFileName}`);

  const ocrOutputDir = path.join(CONFIG.OUTPUT_DIR, 'ocr_logs');
  fs.mkdirSync(ocrOutputDir, { recursive: true });

  // 处理学生版
  console.log('  [学生版] MinerU OCR...');
  const studentResult = await processPDF(pair.studentPdf, ocrOutputDir, {
    model_version: 'vlm',
    is_ocr: true,
    enable_formula: true,
    enable_table: true,
    language: 'ch',
  });

  if (!studentResult.success) {
    console.error(`  学生版 OCR 失败: ${studentResult.error}`);
    return { success: false };
  }
  console.log(`  学生版: ${studentResult.questions?.length || 0} 题, ${studentResult.pages || '?'} 页`);

  // 处理教师版
  console.log('  [教师版] MinerU OCR...');
  const teacherResult = await processPDF(pair.teacherPdf, ocrOutputDir, {
    model_version: 'vlm',
    is_ocr: true,
    enable_formula: true,
    enable_table: true,
    language: 'ch',
  });

  if (!teacherResult.success) {
    console.error(`  教师版 OCR 失败: ${teacherResult.error}`);
    return { success: false };
  }
  console.log(`  教师版: ${teacherResult.questions?.length || 0} 题, ${teacherResult.pages || '?'} 页`);

  return { success: true, studentResult, teacherResult };
}

// ============================================================
// 阶段3: 题目拆分与元数据提取
// ============================================================

/**
 * 从教师版 OCR Markdown 中提取题目的元数据（模块/知识点/难度）
 *
 * 教师版 PDF 中通常包含以下标注信息：
 *   - 章节标题映射到模块（如 "一、校内计算" → 模块: "校内计算"）
 *   - 【标注】标签中的知识点提示
 *   - 难度星级（☆）通常在题干标注或解析中
 *
 * 提取策略：
 *   1. 模块：从章节标题匹配（复用 enrichQuestionsWithSectionTitles 已注入 title）
 *          或从题干前缀匹配（如 "【校内计算】"）
 *   2. 知识点：从 【标注】后的文本提取
 *   3. 难度：统计 ☆ 符号数量
 */
function extractMetaFromTeacherMd(
  teacherMd: string,
  teacherQuestions: ParsedQuestion[],
): ExtractedMeta[] {
  const metaList: ExtractedMeta[] = [];

  // 行级解析教师版 MD
  const lines = teacherMd.split('\n');

  // 扫描章节标题作为模块候选
  const sectionModules: Array<{ lineIndex: number; module: string }> = [];
  const sectionHeaderRe = /^#{1,3}\s*[(（]?[一二三四五六七八九十]+[)）]?[、，]?\s*(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(sectionHeaderRe);
    if (m) {
      sectionModules.push({ lineIndex: i, module: m[1].trim() });
    }
  }

  // 扫描所有 ☆ 行（用于难度计算）
  const allStars: number[] = [];
  const starRe = /☆+/g;
  for (const line of lines) {
    let match: RegExpExecArray | null;
    while ((match = starRe.exec(line)) !== null) {
      allStars.push(match[0].length);
    }
  }

  for (let qi = 0; qi < teacherQuestions.length; qi++) {
    const tq = teacherQuestions[qi];
    const meta: ExtractedMeta = { module: '', knowledge: '', difficulty: '☆☆☆' };

    // 1. 模块提取
    // 优先从题干中的【xxx】前缀提取
    const prefixMatch = tq.content.match(/【(.+?)】/);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      // 排除答案/解析等非模块前缀
      if (!['答案', '解析', '解答', '标注'].includes(prefix)) {
        meta.module = prefix;
      }
    }

    // 如果前缀没匹配到，尝试从 title（章节标题）提取
    if (!meta.module && tq.title) {
      // title 格式如 "校内计算 | 拓展思维"，取第一部分
      const parts = tq.title.split('|').map(p => p.trim());
      meta.module = parts[0];
    }

    // 如果还没有，用题干在 MD 中定位，查找最近的章标题
    if (!meta.module && sectionModules.length > 0) {
      const searchText = tq.content.replace(/\s+/g, '').substring(0, 60);
      let questionLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].replace(/\s+/g, '').includes(searchText)) {
          questionLine = i;
          break;
        }
      }
      if (questionLine >= 0) {
        for (let si = sectionModules.length - 1; si >= 0; si--) {
          if (questionLine >= sectionModules[si].lineIndex) {
            meta.module = sectionModules[si].module;
            break;
          }
        }
      }
    }

    // 2. 知识点提取（从题干 【标注】 或 title 的第二部分）
    if (tq.title) {
      const parts = tq.title.split('|').map(p => p.trim());
      if (parts.length > 1) {
        meta.knowledge = parts[1];
      }
    }

    // 从答案/解析中找 【知识点】 标记
    const combinedText = (tq.answer || '') + (tq.analysis || '');
    const knowledgeMatch = combinedText.match(/【知识点】\s*(.+?)(?:【|$)/);
    if (knowledgeMatch) {
      meta.knowledge = knowledgeMatch[1].trim();
    }

    // 3. 难度提取
    // 尝试从题干中提取 ☆
    const starMatch = tq.content.match(/☆+/);
    if (starMatch) {
      meta.difficulty = starMatch[0];
    } else if (qi < allStars.length) {
      // 按题目序号分配难度（假定教师版每题都有难度标记）
      const starCount = Math.min(5, Math.max(1, allStars[Math.min(qi, allStars.length - 1)]));
      meta.difficulty = '☆'.repeat(starCount);
    }

    // 从解析中查找难度标记
    const diffMatch = combinedText.match(/【难度】\s*(☆+)/);
    if (diffMatch) {
      meta.difficulty = diffMatch[1];
    }

    metaList.push(meta);
  }

  return metaList;
}

/**
 * 从 MinerU 结果中提取图片映射
 * 返回 { originalPath → newRelativePath }
 */
function extractImageMapping(
  result: MinerUResult,
  yearMonth: string,
  gradeName: string,
  hashIdsByIndex: Map<number, string>,
): Map<string, string> {
  const mapping = new Map<string, string>();

  if (!result.structuredData?.blocks) return mapping;

  const blocks = result.structuredData.blocks;
  const timeDisplay = yearMonthToTime(yearMonth);

  for (const block of blocks) {
    if (block.type !== 'image' || !block.imgPath) continue;
    if (!block.imgPath.includes('images/')) continue;

    // 从 imgPath 提取文件名，如 "images/xxx.jpg" → "xxx.jpg"
    const fileName = path.basename(block.imgPath);

    // 根据 block 所在的 pageIdx 推断所属题目
    const questionIndex = inferQuestionIndexFromPage(block.pageIdx, result);

    let hashId = hashIdsByIndex.get(questionIndex);
    if (!hashId) {
      // fallback: 用 imgPath 中的 hash（MinerU 图片名本身就是哈希）
      hashId = fileName.replace(/\.[^.]+$/, '').substring(0, 16);
    }

    // 判断图片类型：位于学生版的是 stem，教师版的是 analysis
    const prefix = 'stem'; // 默认
    const imgIndex = 1; // 后续会递增

    const newRelPath = `images/${timeDisplay}/${gradeName}/${hashId}/${prefix}_q${String(questionIndex + 1).padStart(2, '0')}_${String(imgIndex).padStart(2, '0')}.png`;

    mapping.set(block.imgPath, newRelPath);
  }

  return mapping;
}

/** 根据 pageIdx 推断题目序号（简单按页码比例分配） */
function inferQuestionIndexFromPage(pageIdx: number, result: MinerUResult): number {
  if (!result.pages || result.pages <= 0) return 0;
  if (!result.questions || result.questions.length === 0) return 0;

  // 按页码比例分配
  const ratio = pageIdx / result.pages;
  return Math.min(
    Math.floor(ratio * result.questions.length),
    result.questions.length - 1,
  );
}

// ============================================================
// 阶段4: 图片复制
// ============================================================

function copyImageFile(
  srcPath: string,
  destRelPath: string,
): boolean {
  try {
    const destFull = path.join(CONFIG.OUTPUT_DIR, destRelPath);
    const destDir = path.dirname(destFull);

    if (!fs.existsSync(srcPath)) {
      // 尝试在 ocr_logs 目录下查找
      const altSrc = path.join(CONFIG.OUTPUT_DIR, 'ocr_logs', path.basename(srcPath));
      if (fs.existsSync(altSrc)) {
        return copyImageFile(altSrc, destRelPath);
      }
      // 递归搜索 ocr_logs 下的 images/ 子目录
      return false;
    }

    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, destFull);

    // 确保目标扩展名为 .png（MinerU 输出可能是 .jpg）
    return true;
  } catch (e) {
    console.warn(`  复制图片失败: ${srcPath} → ${destRelPath}: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

/** 递归搜索 images 文件，并在 OCR 输出目录中查找 */
function findImageInOutput(baseDir: string, imgRelPath: string): string | null {
  // 尝试多种路径格式
  const candidates = [
    imgRelPath,
    path.join(baseDir, imgRelPath),
    path.join(baseDir, 'images', path.basename(imgRelPath)),
  ];

  // 递归搜索 images 目录
  function searchInDir(dir: string, fileName: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) return full;
      if (entry.isDirectory()) {
        const found = searchInDir(full, fileName);
        if (found) return found;
      }
    }
    return null;
  }

  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }

  // 在 ocr_logs 下递归搜索
  return searchInDir(baseDir, path.basename(imgRelPath));
}

// ============================================================
// 阶段5: 组装输出
// ============================================================

function assembleOutput(
  pair: PdfPair,
  studentQuestions: ParsedQuestion[],
  teacherQuestions: ParsedQuestion[],
  teacherMeta: ExtractedMeta[],
): OutputQuestion[] {
  const output: OutputQuestion[] = [];
  const maxQuestions = Math.max(studentQuestions.length, teacherQuestions.length);

  for (let i = 0; i < maxQuestions; i++) {
    const sq = studentQuestions[i];
    const tq = teacherQuestions[i];
    const meta = teacherMeta[i] || { module: '', knowledge: '', difficulty: '☆☆☆' };

    const questionNumber = String(i + 1);
    const hashId = generateHashId(pair.gradeName, pair.timeName, questionNumber);

    // 题干：来自学生版
    let stemContent = sq?.content || '';
    let stemImages = '';
    if (sq?.hasImage && stemContent) {
      const imgMatches = stemContent.match(/!\[.*?\]\(images\/[^)]+\)/g);
      if (imgMatches) {
        const timeDisp = yearMonthToTime(pair.yearMonth);
        const imgPaths: string[] = [];
        for (let j = 0; j < imgMatches.length; j++) {
          const fileName = imgMatches[j].match(/images\/([^)]+)/)?.[1] || '';
          const ext = path.extname(fileName) || '.png';
          const newName = `stem_q${questionNumber.padStart(2, '0')}_${String(j + 1).padStart(2, '0')}${ext}`;
          const newRelPath = `images/${timeDisp}/${pair.gradeName}/${hashId}/${newName}`;
          imgPaths.push(newRelPath);
          // 替换题干中的图片路径
          stemContent = stemContent.replace(imgMatches[j], `![](${newRelPath})`);
        }
        stemImages = imgPaths.join(';');
      }
    }

    // 答案：来自教师版
    let answer = tq?.answer || '';
    let answerImages = '';

    // 解析：来自教师版
    let analysis = tq?.analysis || '';
    let analysisImages = '';

    // 处理教师版图片
    if (tq) {
      const teacherText = tq.content + (tq.answer || '') + (tq.analysis || '');
      const imgMatches = teacherText.match(/!\[.*?\]\(images\/[^)]+\)/g);
      if (imgMatches) {
        const timeDisp = yearMonthToTime(pair.yearMonth);
        const answerImgPaths: string[] = [];
        const analysisImgPaths: string[] = [];
        let imgIdx = 0;

        for (const imgMatch of imgMatches) {
          const fileName = imgMatch.match(/images\/([^)]+)/)?.[1] || '';
          const ext = path.extname(fileName) || '.png';
          imgIdx++;

          // 检查图片出现在答案还是解析中
          const imgPos = teacherText.indexOf(imgMatch);
          const answerPos = teacherText.indexOf(tq.answer || '');
          const analysisPos = teacherText.indexOf(tq.analysis || '');

          if (analysisPos >= 0 && imgPos >= analysisPos) {
            // 解析图片
            const newName = `analysis_q${questionNumber.padStart(2, '0')}_${String(imgIdx).padStart(2, '0')}${ext}`;
            const newRelPath = `images/${timeDisp}/${pair.gradeName}/${hashId}/${newName}`;
            analysisImgPaths.push(newRelPath);
            if (tq.analysis) {
              tq.analysis = (tq.analysis || '').replace(imgMatch, `![](${newRelPath})`);
            }
          } else if (answerPos >= 0 && imgPos >= answerPos) {
            // 答案图片
            const newName = `answer_q${questionNumber.padStart(2, '0')}_${String(imgIdx).padStart(2, '0')}${ext}`;
            const newRelPath = `images/${timeDisp}/${pair.gradeName}/${hashId}/${newName}`;
            answerImgPaths.push(newRelPath);
            if (tq.answer) {
              tq.answer = (tq.answer || '').replace(imgMatch, `![](${newRelPath})`);
            }
          }
        }

        answerImages = answerImgPaths.join(';');
        analysisImages = analysisImgPaths.join(';');
        analysis = tq.analysis || '';
        answer = tq.answer || '';
      }
    }

    output.push({
      hash_id: hashId,
      年级: pair.gradeName,
      时间: pair.timeName,
      题号: questionNumber,
      题干: stemContent,
      题图: stemImages,
      解析题图: analysisImages,
      答案: answer,
      答案图片: answerImages,
      解析: analysis,
      模块: meta.module,
      知识点: meta.knowledge,
      难度星级: meta.difficulty,
      source_folder: `${pair.yearMonth}/${pair.gradeDir}`,
      student_file: `${pair.yearMonth}/${pair.gradeDir}/${pair.studentFileName}`,
      teacher_file: `${pair.yearMonth}/${pair.gradeDir}/${pair.teacherFileName}`,
      needs_review: 'Y',
    });
  }

  return output;
}

// ============================================================
// 输出写入
// ============================================================

function writeOutput(allQuestions: OutputQuestion[]): void {
  // JSON
  const jsonPath = path.join(CONFIG.OUTPUT_DIR, 'questions.json');
  fs.writeFileSync(jsonPath, JSON.stringify(allQuestions, null, 2), 'utf-8');
  console.log(`\nJSON 已写入: ${jsonPath} (${allQuestions.length} 题)`);

  // CSV (utf-8-sig)
  const csvPath = path.join(CONFIG.OUTPUT_DIR, 'questions.csv');
  const headers = [
    'hash_id', '年级', '时间', '题号', '题干', '题图', '解析题图',
    '答案', '答案图片', '解析', '模块', '知识点', '难度星级',
    'source_folder', 'student_file', 'teacher_file', 'needs_review',
  ];

  const csvLines: string[] = [headers.join(',')];
  for (const q of allQuestions) {
    const row = headers.map(h => {
      const val = (q as any)[h] || '';
      // CSV 转义：包含逗号、引号或换行的字段用双引号包裹
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvLines.push(row.join(','));
  }

  // 写入 BOM 头确保 Excel 正确识别 UTF-8
  const BOM = '\uFEFF';
  fs.writeFileSync(csvPath, BOM + csvLines.join('\n'), 'utf-8');
  console.log(`CSV 已写入: ${csvPath} (${allQuestions.length} 题)`);
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('=== 散测卷批量 OCR 识别 ===\n');

  const token = getToken();
  console.log(`Token: ${token.substring(0, 20)}...`);
  console.log(`输入目录: ${CONFIG.INPUT_DIR}`);
  console.log(`输出目录: ${CONFIG.OUTPUT_DIR}\n`);

  // 创建输出目录
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(CONFIG.OUTPUT_DIR, 'ocr_logs'), { recursive: true });
  fs.mkdirSync(path.join(CONFIG.OUTPUT_DIR, 'images'), { recursive: true });
  fs.mkdirSync(path.join(CONFIG.OUTPUT_DIR, 'tmp'), { recursive: true });

  // 阶段1: 扫描配对
  const pairs = scanPdfPairs();
  if (pairs.length === 0) {
    console.log('未找到任何 PDF 对，退出');
    process.exit(0);
  }

  // 加载进度
  const progress = loadProgress();
  const allQuestions: OutputQuestion[] = [];

  // 阶段2-5: 逐对处理
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const pairKey = getPairKey(pair);

    // 检查是否已完成
    if (progress.completedPairs.includes(pairKey)) {
      console.log(`\n[${i + 1}/${pairs.length}] ${pairKey} - 已完成，跳过`);
      continue;
    }

    // OCR 识别
    const { success, studentResult, teacherResult } = await processPdfPair(pair, i, pairs.length);

    if (!success || !studentResult || !teacherResult) {
      console.error(`  处理失败，跳过: ${pairKey}`);
      // 注意：失败不记录进度，允许换 token 后重试
      continue;
    }

    // 阶段3: 题目拆分
    const studentQuestions = studentResult.questions || [];
    const teacherQuestions = teacherResult.questions || [];
    console.log(`  拆分: 学生版 ${studentQuestions.length} 题, 教师版 ${teacherQuestions.length} 题`);

    // 从教师版 MD 提取元数据
    const teacherMeta = extractMetaFromTeacherMd(
      studentResult.markdownContent || '',
      teacherQuestions,
    );

    // 阶段4: 图片处理 - 从 MinerU 结果中复制图片到输出目录
    const allResults = [studentResult, teacherResult];
    for (const result of allResults) {
      if (!result.structuredData?.blocks) continue;
      for (const block of result.structuredData.blocks) {
        if (block.type !== 'image' || !block.imgPath) continue;
        // 查找实际图片文件
        let srcPath = block.imgPath;
        if (!fs.existsSync(srcPath) && result.savedDir) {
          srcPath = path.join(result.savedDir, block.imgPath);
        }
        if (!fs.existsSync(srcPath)) {
          // 跳过未找到的文件
          continue;
        }
        // 复制到 images/ 目录（保持文件名）
        const destDir = path.join(CONFIG.OUTPUT_DIR, 'images', 'raw');
        fs.mkdirSync(destDir, { recursive: true });
        const destPath = path.join(destDir, path.basename(block.imgPath));
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    // 阶段5: 组装输出
    const questions = assembleOutput(pair, studentQuestions, teacherQuestions, teacherMeta);
    allQuestions.push(...questions);

    // 更新进度
    progress.completedPairs.push(pairKey);
    progress.totalQuestions = allQuestions.length;
    saveProgress(progress);

    // 增量写入 JSON（防止中断丢失数据）
    const jsonPath = path.join(CONFIG.OUTPUT_DIR, 'questions.json');
    fs.writeFileSync(jsonPath, JSON.stringify(allQuestions, null, 2), 'utf-8');

    console.log(`  ✓ 完成: ${questions.length} 题, 累计 ${allQuestions.length} 题`);
  }

  // 最终输出
  console.log('\n=== 输出结果 ===');
  writeOutput(allQuestions);

  // 统计
  const modules = new Set(allQuestions.map(q => q.模块).filter(Boolean));
  const knowledges = new Set(allQuestions.map(q => q.知识点).filter(Boolean));
  console.log(`\n模块去重: ${modules.size} 个`);
  console.log(`知识点去重: ${knowledges.size} 个`);
  console.log(`\n输出目录: ${CONFIG.OUTPUT_DIR}`);
  console.log('=== 处理完成 ===');
}

main().catch(e => {
  console.error('脚本执行失败:', e);
  process.exit(1);
});
