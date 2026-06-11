/**
 * 题库 MD 导出生成器
 *
 * 将 Prisma Question 记录按字段格式化为结构化 Markdown 文档。
 * 支持单题导出和批量导出。
 */

import type { Question, KnowledgeTag } from '@prisma/client';
import { QuestionType, Grade, QuestionStatus } from '@prisma/client';

export type QuestionWithTags = Question & {
  knowledgeTag: KnowledgeTag | null;
};

const TYPE_CN: Record<QuestionType, string> = {
  FILL_BLANK: '填空题',
  CHOICE: '选择题',
  SOLUTION: '解答题',
  CALCULATION: '计算题',
};

const GRADE_CN: Record<Grade, string> = {
  P1: '一年级',
  P2: '二年级',
  P3: '三年级',
  P4: '四年级',
  P5: '五年级',
  P6: '六年级',
};

const STATUS_CN: Record<QuestionStatus, string> = {
  DRAFT: '草稿',
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
};

const DIFFICULTY_STARS: Record<number, string> = {
  1: '★☆☆☆☆',
  2: '★★☆☆☆',
  3: '★★★☆☆',
  4: '★★★★☆',
  5: '★★★★★',
};

function fmtDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildTagPath(tag: KnowledgeTag): string {
  return [tag.module, tag.topic, tag.subtopic, tag.knowledge, tag.skill]
    .filter(Boolean)
    .join(' > ');
}

// 保留兼容函数，但简化为单标签版本
function buildTagTree(tags: KnowledgeTag[]): string[] {
  if (tags.length === 0) return [];
  const path = buildTagPath(tags[0]);
  return path ? [path] : [];
}

function formatOptions(optionsStr: string | null): string {
  if (!optionsStr) return '';
  try {
    const opts = JSON.parse(optionsStr) as string[];
    if (!Array.isArray(opts) || opts.length === 0) return '';
    return 'ABCDEFGH'.slice(0, opts.length)
      .split('')
      .map((l, i) => `  ${l}. ${opts[i]}`)
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * 生成单道题目的 Markdown 片段
 */
export function renderQuestionToMd(q: QuestionWithTags, index?: number): string {
  const lines: string[] = [];

  const prefix = index !== undefined ? `## 题目 ${index + 1}` : `## ${q.id}`;
  lines.push(prefix);
  lines.push('');

  lines.push(`- **题型**: ${TYPE_CN[q.type]}`);
  lines.push(`- **年级**: ${GRADE_CN[q.grade]} (${q.grade})`);
  lines.push(`- **难度**: ${DIFFICULTY_STARS[q.difficulty] || '★★★☆☆'} (${q.difficulty})`);
  lines.push(`- **状态**: ${STATUS_CN[q.status]}`);
  if (q.source) lines.push(`- **来源**: ${q.source}`);
  if (q.year) lines.push(`- **年份**: ${q.year}`);
  if (q.competition) lines.push(`- **竞赛**: ${q.competition}`);
  if (q.sourcePdfName) lines.push(`- **原始PDF**: ${q.sourcePdfName}`);

  const tagPath = q.knowledgeTag ? buildTagPath(q.knowledgeTag) : null;
  if (tagPath) {
    lines.push(`- **知识标签**: ${tagPath}`);
  }

  lines.push(`- **创建时间**: ${fmtDate(new Date(q.createdAt))}`);
  if (q.updatedAt) {
    lines.push(`- **更新时间**: ${fmtDate(new Date(q.updatedAt))}`);
  }
  lines.push('');

  lines.push('### 题干');
  lines.push('');
  lines.push(q.content);
  lines.push('');

  const optionsBlock = formatOptions(q.options);
  if (optionsBlock) {
    lines.push('### 选项');
    lines.push('');
    lines.push(optionsBlock);
    lines.push('');
  }

  lines.push('### 答案');
  lines.push('');
  lines.push(q.answer);
  lines.push('');

  if (q.solution) {
    lines.push('### 解析');
    lines.push('');
    lines.push(q.solution);
    lines.push('');
  }

  if (q.formulas) {
    try {
      const formulas = JSON.parse(q.formulas) as Array<{ latex: string }>;
      if (formulas.length > 0) {
        lines.push('### 公式');
        lines.push('');
        for (const f of formulas) {
          lines.push(`- \`${f.latex}\``);
        }
        lines.push('');
      }
    } catch { /* skip */ }
  }

  return lines.join('\n');
}

/**
 * 生成批量题目的完整 MD 文档
 */
export function renderQuestionsToMd(questions: QuestionWithTags[]): string {
  const lines: string[] = [];

  const now = fmtDate(new Date());
  lines.push(`# 题库导出`);
  lines.push('');
  lines.push(`> 导出时间: ${now}  |  共 ${questions.length} 道题目`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (let i = 0; i < questions.length; i++) {
    lines.push(renderQuestionToMd(questions[i], i));
    if (i < questions.length - 1) {
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}
