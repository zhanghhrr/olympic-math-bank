import { PrismaClient, Prisma, QuestionType, Grade, QuestionStatus } from '@prisma/client';
import { ParsedQuestion } from './mineru-client';
import { getTagPath, getTagHierarchy } from './knowledge-keywords';
import { autoMatchKnowledgeTagsWithLLM } from './tagging';
import { prisma } from '@/lib/db/prisma';
import { verifyFormulasFromJson, serializeVerifiedFormulas, getVerifySummary } from './formula-verifier';
import { detectQuestionType, HybridQuestionIdentifier } from './question-identifier';
import { normalizeQuestionFields } from '@/lib/latex/normalizer';
export { detectQuestionType };

const importPrisma = prisma as PrismaClient;

export function stripQuestionNumber(content: string): string {
  if (!content) return content;

  const pattern = /^\s*(\d+[\.、．]|第\s*\d+\s*题|[一二三四五六七八九十]+[、，,]|[\(（]\s*\d+\s*[\)）]|[\[【]?\d+[\]】]?|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|[ⅰⅱⅲⅳⅴ]+[.、])\s*/;

  return content.replace(pattern, '');
}

export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  questions: Array<{
    success: boolean;
    questionId?: string;
    error?: string;
    matchedTagId?: string | null;
    matchedTagDetails?: Array<{
      id: string;
      name: string;
      path: string;
      hierarchy: any;
    }>;
  }>;
}

export interface ImportOptions {
  grade?: Grade;
  source?: string;
  autoSplit?: boolean;
  autoMatchTags?: boolean;
}

export async function smartImportFromOCR(
  ocrResults: Array<{ success: boolean; parsed?: ParsedQuestion; error?: string; page?: number; questionNumber?: number }>,
  userId: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { grade = 'P3', source = 'OCR导入', autoMatchTags = true } = options;

  const result: ImportResult = {
    total: ocrResults.length,
    success: 0,
    failed: 0,
    questions: [],
  };

  // 预处理所有题目数据，收集成功后批量写入
  const toCreate: Array<Prisma.QuestionCreateManyInput> = [];
  const failedItems: Array<{ error: string }> = [];

  for (const ocrResult of ocrResults) {
    if (!ocrResult.success || !ocrResult.parsed) {
      result.failed++;
      failedItems.push({ error: ocrResult.error || 'OCR识别失败' });
      continue;
    }

    try {
      const parsed = ocrResult.parsed;

      let matchedTagId: string | null = null;
      if (autoMatchTags && parsed.content) {
        try {
          const combinedContent = [
            parsed.content,
            parsed.answer || '',
            parsed.analysis || ''
          ].join(' ');
          matchedTagId = await autoMatchKnowledgeTagsWithLLM(combinedContent, parsed.title);
        } catch (tagError) {
          console.error('[Import Warning] 自动打标签失败，跳过:', tagError);
          matchedTagId = null;
        }
      }

      const questionType = HybridQuestionIdentifier.questionTypeToDB(detectQuestionType(parsed.content));
      const difficulty = estimateDifficulty(parsed.content);
      const cleanedContent = stripQuestionNumber(parsed.content);

      // LaTeX 公式规范化：将 \R → \mathbb{R} 等快捷宏展开为标准 LaTeX
      // 确保入库的公式格式统一，降低后续人工修正成本
      const normalized = normalizeQuestionFields({
        content: cleanedContent,
        answer: parsed.answer || '',
        solution: parsed.analysis || '',
      });

      let verifiedFormulas = parsed.formulas || null;
      if (parsed.formulas) {
        try {
          const verifyResult = verifyFormulasFromJson(parsed.formulas);
          if (verifyResult) {
            verifiedFormulas = serializeVerifiedFormulas(verifyResult);
            console.log(`[Import] 公式校验: ${getVerifySummary(verifyResult)}`);
          }
        } catch (verifyError) {
          console.warn('[Import] 公式校验异常，保留原始数据:', verifyError);
        }
      }

      toCreate.push({
        content: normalized.content,
        answer: normalized.answer,
        solution: normalized.solution,
        type: questionType,
        grade: grade as Grade,
        difficulty,
        source,
        status: QuestionStatus.DRAFT,
        createdById: userId,
        formulas: verifiedFormulas,
        sourceBlocks: parsed.sourceBlocks || null,
        knowledgeTagId: matchedTagId,
      });
    } catch (error) {
      console.error(`[Import Error] 题目导入失败:`, error);
      result.failed++;
      failedItems.push({ error: error instanceof Error ? error.message : '导入失败' });
    }
  }

  // 批量写入题目
  if (toCreate.length > 0) {
    try {
      await importPrisma.$transaction(async (tx) => {
        const created = await tx.question.createMany({ data: toCreate });
        return created;
      });

      // 查询刚创建的题目以获取 ID 和知识标签
      const createdQuestions = await importPrisma.question.findMany({
        where: { createdById: userId, source, status: QuestionStatus.DRAFT },
        orderBy: { createdAt: 'desc' },
        take: toCreate.length,
        include: {
          knowledgeTag: {
            include: { parent: { include: { parent: { include: { parent: { include: { parent: true } } } } } } }
          }
        }
      });

      result.success = toCreate.length;

      // 构建返回详情
      for (const q of createdQuestions) {
        const details = q.knowledgeTag ? [{
          id: q.knowledgeTag.id,
          name: q.knowledgeTag.name,
          path: getTagPath(q.knowledgeTag as any),
          hierarchy: getTagHierarchy(q.knowledgeTag as any),
        }] : [];
        result.questions.push({
          success: true,
          questionId: q.id,
          matchedTagId: q.knowledgeTagId,
          matchedTagDetails: details,
        });
      }
    } catch (error) {
      console.error(`[Import Error] 批量写入失败:`, error);
      // 批量写入失败时，所有题目都标记为失败
      for (const _ of toCreate) {
        result.failed++;
        result.questions.push({
          success: false,
          error: error instanceof Error ? error.message : '批量写入失败',
        });
      }
    }
  }

  // 追加预处理阶段的失败项
  for (const fi of failedItems) {
    result.questions.push({ success: false, error: fi.error });
  }

  return result;
}

export async function getQuestionTagPaths(questionId: string): Promise<string[]> {
  const question = await importPrisma.question.findUnique({
    where: { id: questionId },
    include: {
      knowledgeTag: {
        include: {
          parent: { include: { parent: { include: { parent: { include: { parent: true } } } } } }
        }
      }
    }
  });

  if (!question?.knowledgeTag) return [];
  return [getTagPath(question.knowledgeTag as any)];
}

export function estimateDifficulty(content: string, gradeHint?: string): number {
  let difficulty = 2;

  if (content.length > 300) difficulty += 1;
  if (content.length > 800) difficulty += 1;

  const hardKeywords = ['证明', '综合', '拓展', '挑战', '竞赛', '奥数', '拔高', '压轴'];
  const easyKeywords = ['基础', '简单', '入门', '练习', '口算'];
  const mathSignals = [/\b(?:求证|求证于)\b/, /至少.{0,4}种/, /是否存在/, /构造/];

  let hardHits = 0;
  for (const keyword of hardKeywords) {
    if (content.includes(keyword)) hardHits++;
  }
  if (hardHits >= 2) difficulty += 2;
  else if (hardHits === 1) difficulty += 1;

  for (const signal of mathSignals) {
    if (signal.test(content)) { difficulty += 1; break; }
  }

  let easyHits = 0;
  for (const keyword of easyKeywords) {
    if (content.includes(keyword)) easyHits++;
  }
  if (easyHits >= 2) difficulty -= 1;

  if (gradeHint) {
    const gradeNum = parseInt(gradeHint.replace(/[^0-9]/g, ''));
    if (gradeNum >= 5) difficulty = Math.max(difficulty, 3);
    if (gradeNum <= 2) difficulty = Math.min(difficulty, 2);
  }

  return Math.max(1, Math.min(5, difficulty));
}

const GRADE_KEYWORDS: Record<string, string> = {
  '一年级|1年级|上册|下册': 'P1',
  '二年级|2年级': 'P2',
  '三年级|3年级|P3': 'P3',
  '四年级|4年级|P4': 'P4',
  '五年级|5年级|P5': 'P5',
  '六年级|6年级|P6': 'P6',
};

export function inferGrade(content: string, fileName?: string): string {
  const searchText = (fileName || '') + ' ' + content;

  for (const [pattern, grade] of Object.entries(GRADE_KEYWORDS)) {
    for (const kw of pattern.split('|')) {
      if (searchText.includes(kw)) return grade;
    }
  }

  const gradeSignals: Array<{ grade: string; keywords: string[] }> = [
    { grade: 'P1', keywords: ['认识数字', '10以内', '20以内', '加减法基础'] },
    { grade: 'P2', keywords: ['乘法口诀', '表内乘法', '简单图形'] },
    { grade: 'P3', keywords: ['周长', '面积', '小数初步', '多位数'] },
    { grade: 'P4', keywords: ['小数运算', '四则运算', '角', '平行', '垂直'] },
    { grade: 'P5', keywords: ['分数', '方程', '倍数', '因数', '质数', '体积'] },
    { grade: 'P6', keywords: ['百分数', '比和比例', '圆柱', '圆锥', '负数', '奥数'] },
  ];

  let bestMatch = { grade: 'P3', score: 0 };
  for (const { grade, keywords } of gradeSignals) {
    let score = 0;
    for (const kw of keywords) {
      if (searchText.includes(kw)) score++;
    }
    if (score > bestMatch.score) {
      bestMatch = { grade, score };
    }
  }

  return bestMatch.grade;
}

export { autoMatchKnowledgeTagsWithLLM };
export { verifyFormulasFromJson, serializeVerifiedFormulas, getVerifySummary };
