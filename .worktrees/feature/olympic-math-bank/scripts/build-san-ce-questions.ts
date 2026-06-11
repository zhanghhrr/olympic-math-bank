/**
 * 散测卷问卷 JSON 构建脚本
 *
 * 从 ocr_logs/ 中已完成的原始 MD 文件读取，按以下规则构建 questions.json：
 *
 * 学生版 MD 格式：
 *   1. 【标签】题目内容
 *   2. 【标签】题目内容
 *   ...
 *   13. 【标签】题目内容
 *
 * 教师版 MD 格式：
 *   （顶部同学生版）
 *   <table>
 *     <tr><td>题号</td><td>模块</td><td>知识点</td><td>难度星级</td><td>解题方法&关键思路</td><td>答案</td></tr>
 *     <tr><td>1</td><td>校内计算</td><td>大数加减</td><td>☆</td><td>...</td><td>408(5分);211(5分)</td></tr>
 *     ...
 *   </table>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================
// 配置
// ============================================================

const OCR_LOGS_DIR = path.join(
  process.env.USERPROFILE || 'C:\\Users\\Twilight',
  'Downloads',
  '散测卷_ocr_output',
  'ocr_logs',
);

const OUTPUT_DIR = path.join(
  process.env.USERPROFILE || 'C:\\Users\\Twilight',
  'Downloads',
  '散测卷_ocr_output',
);

interface QuestionMeta {
  /** 模块，如 "校内计算" */
  module: string;
  /** 知识点，如 "大数加减" */
  knowledge: string;
  /** 难度星级，如 "☆"、"☆☆☆" */
  difficulty: string;
  /** 原始答案文本（可能含分数标注） */
  answer: string;
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

// ============================================================
// 学生版 MD → 题目列表
// ============================================================

/** 从学生版 MD 中按题号拆分为 1~13 题 */
function splitStudentMd(md: string): Array<{ qNum: number; content: string }> {
  const questions: Array<{ qNum: number; content: string }> = [];

  // 找到第一个题目编号行（跳过标题/小贴士等前置内容）
  // 支持三种格式：
  //   "1. 【xx】" (散测卷)
  //   "## 8. 【xx】" (OCR Markdown 标题)
  //   "1. 计算：xxx" (新初一，无标签)
  const qNumRe = /^(?:#+\s*)?(\d+)\.\s*/;
  const lines = md.split('\n');
  let firstQLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(qNumRe);
    if (m && parseInt(m[1]) === 1) {
      firstQLine = i;
      break;
    }
  }

  if (firstQLine < 0) {
    console.warn('  警告: 未找到题目起始行，使用整篇 MD');
    return [{ qNum: 1, content: md }];
  }

  // 从第一题开始，按题号拆分
  const prefixLines = lines.slice(0, firstQLine);
  const questionLines = lines.slice(firstQLine);

  let currentQNum = 0;
  let currentLines: string[] = [];

  for (const line of questionLines) {
    const m = line.match(qNumRe);
    if (m) {
      const num = parseInt(m[1]);
      if (num >= 1 && num <= 20) {
        // 保存上一题
        if (currentQNum > 0 && currentLines.length > 0) {
          const isInstruction = currentLines.some(l =>
            /本试卷共|答题前|字迹工整|分层标准|测试时间/.test(l)
          );
          if (!isInstruction) {
            questions.push({
              qNum: currentQNum,
              content: currentLines.join('\n').trim(),
            });
          }
        }
        currentQNum = num;
        currentLines = [line];
        continue;
      }
    }
    if (currentQNum > 0) {
      currentLines.push(line);
    }
  }

  // 保存最后一题
  if (currentQNum > 0 && currentLines.length > 0) {
    questions.push({
      qNum: currentQNum,
      content: currentLines.join('\n').trim(),
    });
  }

  return questions;
}

// ============================================================
// 教师版 MD → 元数据表格
// ============================================================

/** 从教师版 MD 中解析答案表格 */
function parseTeacherTable(md: string): Map<number, QuestionMeta> {
  const metaMap = new Map<number, QuestionMeta>();

  // 提取 HTML 表格部分（<table>...</table>）
  // 可能有多个表格，找到包含"题号"或"模块"列头的那个
  const tableMatches = md.match(/<table>[\s\S]*?<\/table>/g);
  if (!tableMatches || tableMatches.length === 0) {
    console.warn('  警告: 未找到教师版答案表格');
    return metaMap;
  }

  // 找到包含"题号"或"模块"的表格（跳过班型分层表格）
  let tableHtml = '';
  for (const t of tableMatches) {
    if (t.includes('题号') || t.includes('模块')) {
      tableHtml = t;
      break;
    }
  }
  if (!tableHtml) {
    // fallback: 使用最后一个表格
    tableHtml = tableMatches[tableMatches.length - 1];
  }

  // 按 <tr> 拆分
  const rows = tableHtml.match(/<tr>[\s\S]*?<\/tr>/g);
  if (!rows || rows.length < 2) {
    console.warn('  警告: 表格行数不足');
    return metaMap;
  }

  // 跳过表头，从第二行开始
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td>(.*?)<\/td>/g);
    if (!cells || cells.length < 6) continue;

    const cleanCell = (c: string) =>
      c.replace(/<\/?td>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();

    const qNum = parseInt(cleanCell(cells[0]));
    const module = cleanCell(cells[1]);
    const knowledge = cleanCell(cells[2]);
    const difficulty = cleanCell(cells[3]);
    const answer = cleanCell(cells[5]); // cells[4] 是 解题方法，cells[5] 是 答案

    if (qNum >= 1 && qNum <= 20) {
      metaMap.set(qNum, {
        module,
        knowledge,
        difficulty,
        answer: cleanAnswer(answer),
      });
    }
  }

  return metaMap;
}

/** 清理答案文本：保留分数标注，统一分隔符 */
function cleanAnswer(raw: string): string {
  return raw
    .replace(/\s*;\s*/g, '；')
    .trim();
}

// ============================================================
// 图片提取
// ============================================================

/** 从题目内容中提取所有 ![](images/xxx) 路径 */
function extractImages(content: string): string[] {
  const images: string[] = [];
  const re = /!\[.*?\]\(images\/[^)]+\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    images.push(m[0]);
  }
  return images;
}

// ============================================================
// 主处理逻辑
// ============================================================

/** 生成 hash_id */
function makeHash(grade: string, time: string, qNum: number): string {
  return crypto.createHash('md5').update(`${grade}-${time}-${qNum}`).digest('hex').substring(0, 16);
}

/** 从文件名推断年级和月 */
function parseGradeAndMonth(fileName: string): { grade: string; yearMonth: string; time: string } {
  // 文件名示例: "2025年7月新三年级数学散测卷（学生版）"
  // 或 "2025年9月一年级数学散测卷（学生版）"
  // 或 "桃李未来_创新思维_2026年4月入学测试卷_新初一"

  // 提取年月
  const ymMatch = fileName.match(/(\d{4})年(\d{1,2})月/);
  const yearMonth = ymMatch ? `${ymMatch[1]}${ymMatch[2].padStart(2, '0')}` : '000000';
  const time = ymMatch ? `${ymMatch[1]}年${ymMatch[2]}月` : '未知';

  // 提取年级（保留中文数字格式）
  let grade = '';
  const afterMonth = fileName.substring(fileName.indexOf('月') + 1);

  // 新初一特殊格式：文件名含"新初一"
  if (fileName.includes('新初一')) {
    grade = '新初一年级';
    return { grade, yearMonth, time };
  }

  const gradeMatch = afterMonth.match(
    /(?:新)?([一二三四五六]|初[一二三])(?:年级|年级散测)/,
  );
  if (gradeMatch) {
    const isNew = afterMonth.includes('新');
    grade = isNew ? `新${gradeMatch[1]}年级` : `${gradeMatch[1]}年级`;

    // 处理特殊年级描述（从文件名识别）
    if (afterMonth.match(/现6年级|现六年级/)) grade = '现6年级';
  } else {
    // 尝试匹配阿拉伯数字格式
    const numGradeMatch = afterMonth.match(/(?:新)?(\d)升(\d)/);
    if (numGradeMatch) {
      grade = `新${numGradeMatch[1]}年级（${numGradeMatch[1]}升${numGradeMatch[2]}）`;
    }
  }

  if (!grade) grade = '未知';

  return { grade, yearMonth, time };
}

/** 处理一个 PDF 对 */
function processPair(
  studentMdPath: string,
  teacherMdPath: string,
): OutputQuestion[] {
  const studentMd = fs.readFileSync(studentMdPath, 'utf-8');
  const teacherMd = fs.readFileSync(teacherMdPath, 'utf-8');

  const studentFileName = path.basename(studentMdPath);
  const teacherFileName = path.basename(teacherMdPath);
  const { grade, yearMonth, time } = parseGradeAndMonth(studentFileName);

  // 拆分学生版题目
  const questions = splitStudentMd(studentMd);

  // 解析教师版元数据
  const metaMap = parseTeacherTable(teacherMd);

  const output: OutputQuestion[] = [];

  for (const q of questions) {
    const meta = metaMap.get(q.qNum) || {
      module: '',
      knowledge: '',
      difficulty: '☆☆☆',
      answer: '',
    };

    const hashId = makeHash(grade, time, q.qNum);

    // 提取题干中的图片
    const stemImages = extractImages(q.content);
    const stemImagePaths = stemImages
      .map(img => {
        const m = img.match(/\(images\/(.+)\)/);
        return m ? `images/${time}/${grade}/${hashId}/stem_q${String(q.qNum).padStart(2, '0')}_${m[1].split('/').pop()}` : '';
      })
      .filter(Boolean)
      .join(';');

    output.push({
      hash_id: hashId,
      年级: grade,
      时间: time,
      题号: String(q.qNum),
      题干: q.content,
      题图: stemImagePaths,
      解析题图: '',
      答案: meta.answer,
      答案图片: '',
      解析: '',
      模块: meta.module,
      知识点: meta.knowledge,
      难度星级: meta.difficulty,
      source_folder: `${yearMonth}/${grade}`,
      student_file: studentFileName,
      teacher_file: teacherFileName,
      needs_review: 'Y',
    });
  }

  return output;
}

/** 扫描已完成的 PDF 对（学生版 + 教师版 MD 均已存在） */
function scanCompletedPairs(): Array<{ studentMd: string; teacherMd: string }> {
  if (!fs.existsSync(OCR_LOGS_DIR)) {
    console.error('OCR 日志目录不存在:', OCR_LOGS_DIR);
    return [];
  }

  const allFiles = fs.readdirSync(OCR_LOGS_DIR);
  // 只取主 MD 文件（-full.md 结尾，排除 layout/context 等辅助文件）
  const mdFiles = allFiles.filter(f => f.endsWith('-full.md'));

  // 从文件名提取原始 PDF 名称（去掉时间戳前缀和 -full.md 后缀）
  function extractBaseName(fileName: string): string {
    // 去掉时间戳前缀
    let name = fileName.replace(/^\d+-/, '');
    // 去掉 -full.md 后缀
    name = name.replace(/-full\.md$/, '');
    return name;
  }

  // 按学生/教师/答案分类
  const studentFiles: string[] = [];
  const answerFiles: string[] = [];

  for (const f of mdFiles) {
    const base = extractBaseName(f);
    if (base.includes('学生版') || base.includes('学生版_')) {
      studentFiles.push(f);
    } else if (
      base.includes('教师版') || base.includes('答案版') ||
      base.includes('答案') || base.includes('教师版_')
    ) {
      answerFiles.push(f);
    }
  }

  // 对于没有明确标记的文件，按两种策略匹配
  const unmatchedFiles: string[] = [];
  for (const f of mdFiles) {
    if (studentFiles.includes(f) || answerFiles.includes(f)) continue;
    const base = extractBaseName(f);
    // 策略1: "XXX答案" 后缀匹配（如新初一）
    const answerBase = base + '答案';
    const matchingAnswer = mdFiles.find(af => {
      const ab = extractBaseName(af);
      return ab === answerBase && !studentFiles.includes(af) && !answerFiles.includes(af);
    });
    if (matchingAnswer) {
      studentFiles.push(f);
      answerFiles.push(matchingAnswer);
    } else {
      unmatchedFiles.push(f);
    }
  }

  // 策略2: 对仍未匹配的文件，通过 makeKey 与 answerFiles 做模糊匹配
  for (const f of unmatchedFiles) {
    const sBase = extractBaseName(f);
    const sKey = makeKey(sBase);
    const matchingAnswer = answerFiles.find(af => {
      const aBase = extractBaseName(af);
      const aKey = makeKey(aBase);
      return sKey === aKey;
    });
    if (matchingAnswer) {
      studentFiles.push(f);
    }
  }

  // 建立 key → file 映射（用于灵活匹配）
  function makeKey(name: string): string {
    return name
      .replace(/_学生版_/g, '')
      .replace(/_教师版_/g, '')
      .replace(/_答案版_/g, '')
      .replace(/答案$/g, '') // 新初一答案 → 新初一
      .replace(/_仅录取.*$/g, '')
      .replace(/__\d+\.\d+修改_?$/g, '')
      .replace(/__1_$/g, '')
      .replace(/_1_$/g, '') // _教师版_/_学生版_ 去除后残留的 _1_ 后缀
      .replace(/_3\.17$/g, '')
      .replace(/_0501$/g, '')
      .replace(/_0509$/g, '')
      .replace(/_0526$/g, '')
      .replace(/_0601$/g, '')
      .replace(/_0607$/g, '');
  }

  const { keys: teacherKeys, mdFiles: tFiles } = (() => {
    const keys: Array<{ key: string; file: string }> = [];
    const files = new Set<string>();
    for (const f of answerFiles) {
      const base = extractBaseName(f);
      const k = makeKey(base);
      keys.push({ key: k, file: f });
      files.add(f);
    }
    return { keys, mdFiles: Array.from(files) };
  })();

  const pairs: Array<{ studentMd: string; teacherMd: string }> = [];

  for (const sf of studentFiles) {
    const sBase = extractBaseName(sf);
    const sKey = makeKey(sBase);

    // 在教师版中找匹配
    const tEntry = teacherKeys.find(t => t.key === sKey);
    if (tEntry) {
      pairs.push({
        studentMd: path.join(OCR_LOGS_DIR, sf),
        teacherMd: path.join(OCR_LOGS_DIR, tEntry.file),
      });
      teacherKeys.splice(teacherKeys.indexOf(tEntry), 1);
    }
  }

  return pairs;
}

// ============================================================
// 入口
// ============================================================

console.log('=== 散测卷问卷 JSON 构建 ===\n');

const pairs = scanCompletedPairs();
console.log(`找到 ${pairs.length} 对已完成的 OCR 结果\n`);

const allQuestions: OutputQuestion[] = [];

for (let i = 0; i < pairs.length; i++) {
  const pair = pairs[i];
  const sName = path.basename(pair.studentMd).replace(/_学生版_-full\.md$/, '');
  console.log(`[${i + 1}/${pairs.length}] ${sName}`);

  try {
    const questions = processPair(pair.studentMd, pair.teacherMd);
    console.log(`  提取 ${questions.length} 题`);
    allQuestions.push(...questions);
  } catch (e) {
    console.error(`  处理失败: ${e instanceof Error ? e.message : e}`);
  }
}

// 写入 questions.json
const jsonPath = path.join(OUTPUT_DIR, 'questions.json');
fs.writeFileSync(jsonPath, JSON.stringify(allQuestions, null, 2), 'utf-8');
console.log(`\nJSON 已写入: ${jsonPath} (${allQuestions.length} 题)`);

// 写入 questions.csv
const csvPath = path.join(OUTPUT_DIR, 'questions.csv');
const headers = [
  'hash_id', '年级', '时间', '题号', '题干', '题图', '解析题图',
  '答案', '答案图片', '解析', '模块', '知识点', '难度星级',
  'source_folder', 'student_file', 'teacher_file', 'needs_review',
];

const BOM = '\uFEFF';
const csvLines: string[] = [headers.join(',')];
for (const q of allQuestions) {
  const row = headers.map(h => {
    const val = (q as any)[h] || '';
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  });
  csvLines.push(row.join(','));
}
fs.writeFileSync(csvPath, BOM + csvLines.join('\n'), 'utf-8');
console.log(`CSV 已写入: ${csvPath} (${allQuestions.length} 题)`);

// 统计
const modules = new Set(allQuestions.map(q => q.模块).filter(Boolean));
const knowledges = new Set(allQuestions.map(q => q.知识点).filter(Boolean));
console.log(`\n模块去重: ${modules.size} 个`);
console.log(`知识点去重: ${knowledges.size} 个`);
console.log('\n=== 构建完成 ===');
