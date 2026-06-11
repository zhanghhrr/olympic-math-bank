/**
 * 题库导出/导入工具模块
 *
 * 提供题目的批量导出（DB → JSON）和导入（JSON → DB）功能。
 * 导出格式为自包含 JSON，包含题目内容、答案、标签、公式和源块信息，
 * 可直接用于跨环境迁移或手动编辑后重新导入。
 *
 * 使用方式:
 *   import { exportQuestions, importQuestions } from '@/lib/export-import';
 *
 *   // 导出
 *   const json = await exportQuestions({ grade: 'P5', type: 'FILL_BLANK' });
 *
 *   // 导入
 *   const result = await importQuestions(json, userId);
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma, QuestionStatus, Grade, QuestionType } from '@prisma/client';
import { autoMatchKnowledgeTagsWithLLM } from '@/lib/ocr/tagging';
import { estimateDifficulty, stripQuestionNumber } from '@/lib/ocr/import-to-db';
import { HybridQuestionIdentifier, detectQuestionType } from '@/lib/ocr/question-identifier';

// ---- 类型定义 ----

/** 导出的题目格式（自包含 JSON） */
export interface ExportedQuestion {
  content: string;
  answer: string;
  solution?: string | null;
  type: string;
  grade: string;
  difficulty: number;
  source?: string | null;
  year?: number | null;
  competition?: string | null;
  formulas?: string | null;
  sourceBlocks?: string | null;
  sourcePdfName?: string | null;
  /** 知识标签路径（用于导入时重新匹配） */
  knowledgeTagPath?: string | null;
}

/** 导出元信息 */
export interface ExportManifest {
  version: 1;
  exportedAt: string;
  totalCount: number;
  filters: ExportOptions;
}

/** 完整导出文件格式 */
export interface ExportFile {
  manifest: ExportManifest;
  questions: ExportedQuestion[];
}

/** 导入结果 */
export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ index: number; error: string }>;
  importedIds: string[];
}

// ---- 导出选项 ----

export interface ExportOptions {
  /** 按年级筛选 */
  grade?: Grade;
  /** 按题型筛选 */
  type?: QuestionType;
  /** 按状态筛选 */
  status?: QuestionStatus;
  /** 按来源筛选 */
  source?: string;
  /** 按竞赛筛选 */
  competition?: string;
  /** 按创建者筛选 */
  createdById?: string;
  /** 最多导出条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

// ---- 导出 ----

/**
 * 从数据库批量导出题目
 *
 * @param options  筛选条件
 * @returns 自包含的导出文件（含 manifest + questions）
 */
export async function exportQuestions(
  options: ExportOptions = {},
): Promise<ExportFile> {
  const where: Prisma.QuestionWhereInput = {};

  if (options.grade) where.grade = options.grade;
  if (options.type) where.type = options.type;
  if (options.status) where.status = options.status;
  if (options.source) where.source = options.source;
  if (options.competition) where.competition = options.competition;
  if (options.createdById) where.createdById = options.createdById;

  const questions = await prisma.question.findMany({
    where,
    include: {
      knowledgeTag: {
        include: {
          parent: {
            include: {
              parent: {
                include: {
                  parent: {
                    include: { parent: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 1000,
    skip: options.offset ?? 0,
  });

  const exported: ExportedQuestion[] = questions.map((q) => ({
    content: q.content,
    answer: q.answer,
    solution: q.solution,
    type: q.type,
    grade: q.grade,
    difficulty: q.difficulty,
    source: q.source,
    year: q.year,
    competition: q.competition,
    formulas: q.formulas,
    sourceBlocks: q.sourceBlocks,
    sourcePdfName: q.sourcePdfName,
    knowledgeTagPath: buildTagPath(q.knowledgeTag),
  }));

  return {
    manifest: {
      version: 1,
      exportedAt: new Date().toISOString(),
      totalCount: exported.length,
      filters: options,
    },
    questions: exported,
  };
}

/** 递归构建标签路径字符串 */
function buildTagPath(tag: any): string | null {
  if (!tag) return null;
  const parts: string[] = [];
  let current: any = tag;
  while (current) {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(' > ');
}

// ---- 导入 ----

export interface ImportOptions {
  /** 默认年级（当题目数据未指定时） */
  defaultGrade?: Grade;
  /** 默认来源 */
  defaultSource?: string;
  /** 是否自动打标签（对已匹配标签的题目会跳过） */
  autoMatchTags?: boolean;
  /** 是否跳过去重检查 */
  skipDedup?: boolean;
  /** 是否同时创建 QuestionKnowledgeTag 关联 */
  createTagRelations?: boolean;
  /** 批量写入大小（每批多少题） */
  batchSize?: number;
}

/**
 * 从导出文件批量导入题目到数据库
 *
 * @param data     导出文件（ExportFile 格式，也支持原始 ExportedQuestion[]）
 * @param userId   创建者 ID
 * @param options  导入选项
 * @returns 导入结果
 */
export async function importQuestions(
  data: ExportFile | ExportedQuestion[],
  userId: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const {
    defaultGrade = 'P3',
    defaultSource = '批量导入',
    autoMatchTags = true,
    createTagRelations = true,
    batchSize = 50,
  } = options;

  // 统一格式
  const questionList: ExportedQuestion[] = Array.isArray(data)
    ? data
    : data.questions;

  const result: ImportResult = {
    total: questionList.length,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    importedIds: [],
  };

  // 预处理：校验 + 标签匹配
  const toCreate: Array<{
    data: Prisma.QuestionCreateManyInput;
    index: number;
  }> = [];

  for (let i = 0; i < questionList.length; i++) {
    const q = questionList[i];
    try {
      // 基本校验
      if (!q.content?.trim()) {
        result.skipped++;
        result.errors.push({ index: i, error: '题目内容为空' });
        continue;
      }

      const cleanedContent = stripQuestionNumber(q.content);
      const questionType = HybridQuestionIdentifier.questionTypeToDB(
        detectQuestionType(q.content),
      );

      // 标签匹配
      let matchedTagId: string | null = null;
      if (autoMatchTags) {
        try {
          const combinedContent = [q.content, q.answer, q.solution]
            .filter(Boolean)
            .join(' ');
          matchedTagId = await autoMatchKnowledgeTagsWithLLM(combinedContent);
        } catch (tagError) {
          console.warn(`[ExportImport] 第 ${i + 1} 题标签匹配失败:`, tagError);
        }
      }

      toCreate.push({
        data: {
          content: cleanedContent,
          answer: q.answer || '',
          solution: q.solution || null,
          type: questionType,
          grade: (q.grade as Grade) || defaultGrade,
          difficulty: q.difficulty || estimateDifficulty(q.content),
          source: q.source || defaultSource,
          year: q.year ?? null,
          competition: q.competition ?? null,
          status: QuestionStatus.DRAFT,
          createdById: userId,
          formulas: q.formulas ?? null,
          sourceBlocks: q.sourceBlocks ?? null,
          sourcePdfName: q.sourcePdfName ?? null,
          knowledgeTagId: matchedTagId,
        },
        index: i,
      });
    } catch (error) {
      result.failed++;
      result.errors.push({
        index: i,
        error: error instanceof Error ? error.message : '预处理失败',
      });
    }
  }

  // 批量写入
  for (let offset = 0; offset < toCreate.length; offset += batchSize) {
    const batch = toCreate.slice(offset, offset + batchSize);

    try {
      await prisma.$transaction(async (tx) => {
        // 批量创建题目（knowledgeTagId 已包含在 data 中）
        await tx.question.createMany({
          data: batch.map((b) => b.data),
        });
      });

      result.success += batch.length;
    } catch (error) {
      console.error(`[ExportImport] 批量写入失败 (offset=${offset}):`, error);
      result.failed += batch.length;
      const errMsg = error instanceof Error ? error.message : '批量写入失败';
      for (let j = 0; j < batch.length; j++) {
        result.errors.push({
          index: batch[j].index,
          error: errMsg,
        });
      }
    }
  }

  return result;
}

/**
 * 将导出文件序列化为 JSON 字符串（可用于下载）
 */
export function serializeExportFile(data: ExportFile): string {
  return JSON.stringify(data, null, 2);
}

/**
 * 反序列化导出文件（含格式校验）
 */
export function deserializeExportFile(json: string): ExportFile {
  const data = JSON.parse(json);

  if (!data.manifest || typeof data.manifest.version !== 'number') {
    throw new Error('无效的导出文件格式：缺少 manifest');
  }

  if (!Array.isArray(data.questions)) {
    throw new Error('无效的导出文件格式：缺少 questions 数组');
  }

  return data as ExportFile;
}
