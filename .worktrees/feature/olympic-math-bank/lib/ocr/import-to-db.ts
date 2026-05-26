import { PrismaClient, QuestionType, Grade, QuestionStatus } from '@prisma/client';
import { ParsedQuestion } from './mineru-client';
import { getTagPath, getTagHierarchy } from './knowledge-keywords';
import { autoMatchKnowledgeTagsWithLLM } from './tagging';
import { prisma } from '@/lib/db/prisma';
import { verifyFormulasFromJson, serializeVerifiedFormulas, getVerifySummary } from './formula-verifier';
import { detectQuestionType, HybridQuestionIdentifier } from './question-identifier';
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
    matchedTags?: string[];
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

  for (const ocrResult of ocrResults) {
    if (!ocrResult.success || !ocrResult.parsed) {
      result.failed++;
      result.questions.push({
        success: false,
        error: ocrResult.error || 'OCR识别失败',
      });
      continue;
    }

    try {
      const parsed = ocrResult.parsed;

      let matchedTagIds: string[] = [];
      if (autoMatchTags && parsed.content) {
        try {
          const combinedContent = [
            parsed.content,
            parsed.answer || '',
            parsed.analysis || ''
          ].join(' ');
          matchedTagIds = await autoMatchKnowledgeTagsWithLLM(combinedContent, parsed.title);
        } catch (tagError) {
          console.error('[Import Warning] 自动打标签失败，跳过:', tagError);
          matchedTagIds = [];
        }
      }

      const questionType = HybridQuestionIdentifier.questionTypeToDB(detectQuestionType(parsed.content));
      const difficulty = estimateDifficulty(parsed.content);
      const cleanedContent = stripQuestionNumber(parsed.content);

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

      const question = await importPrisma.question.create({
        data: {
          content: cleanedContent,
          answer: parsed.answer || '',
          solution: parsed.analysis || '',
          type: questionType,
          grade: grade,
          difficulty: difficulty,
          source: source,
          status: QuestionStatus.DRAFT,
          createdById: userId,
          formulas: verifiedFormulas,
          sourceBlocks: parsed.sourceBlocks || null,
        },
      });

      if (matchedTagIds.length > 0) {
        for (const tagId of matchedTagIds) {
          await importPrisma.questionKnowledgeTag.create({
            data: {
              questionId: question.id,
              knowledgeTagId: tagId,
            },
          });
        }
      }

      result.success++;
      let matchedTagDetails: Array<{id: string; name: string; path: string; hierarchy: any}> = [];
      if (matchedTagIds.length > 0) {
        const matchedTags = await importPrisma.knowledgeTag.findMany({
          where: { id: { in: matchedTagIds } },
          include: {
            parent: { include: { parent: { include: { parent: { include: { parent: true } } } } } }
          }
        });
        matchedTagDetails = matchedTags.map(tag => ({
          id: tag.id,
          name: tag.name,
          path: getTagPath(tag),
          hierarchy: getTagHierarchy(tag),
        }));
      }

      result.questions.push({
        success: true,
        questionId: question.id,
        matchedTags: matchedTagIds,
        matchedTagDetails,
      });
    } catch (error) {
      console.error(`[Import Error] 题目导入失败:`, error);
      result.failed++;
      result.questions.push({
        success: false,
        error: error instanceof Error ? error.message : '导入失败',
      });
    }
  }

  return result;
}

export async function getQuestionTagPaths(questionId: string): Promise<string[]> {
  const questionTags = await importPrisma.questionKnowledgeTag.findMany({
    where: { questionId },
    include: {
      knowledgeTag: {
        include: {
          parent: { include: { parent: { include: { parent: { include: { parent: true } } } } } }
        }
      }
    }
  });

  return questionTags.map(qt => getTagPath(qt.knowledgeTag));
}

export function estimateDifficulty(content: string): number {
  let difficulty = 2;

  if (content.length > 200) difficulty += 1;
  if (content.length > 500) difficulty += 1;

  const hardKeywords = ['证明', '复杂', '综合', '拓展', '挑战', '竞赛'];
  const easyKeywords = ['基础', '简单', '入门', '练习'];

  for (const keyword of hardKeywords) {
    if (content.includes(keyword)) {
      difficulty += 1;
      break;
    }
  }

  for (const keyword of easyKeywords) {
    if (content.includes(keyword)) {
      difficulty -= 1;
      break;
    }
  }

  return Math.max(1, Math.min(5, difficulty));
}

export { autoMatchKnowledgeTagsWithLLM };
export { verifyFormulasFromJson, serializeVerifiedFormulas, getVerifySummary };
