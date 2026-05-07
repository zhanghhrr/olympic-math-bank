/**
 * OCR结果导入数据库
 * 包含智能标签匹配功能
 */

import { PrismaClient, QuestionType, Grade, QuestionStatus } from '@prisma/client';
import { ParsedQuestion } from './mineru-client';
import { knowledgeKeywords, getTagPath, getTagHierarchy } from './knowledge-keywords';

const prisma = new PrismaClient();

/**
 * 去除题干开头的题号
 * 支持格式：1. 2. 1、 2、 (1) (2) 第1题 第2题 一、二、三 ① ② ③ 等
 */
export function stripQuestionNumber(content: string): string {
  if (!content) return content;
  
  // 匹配常见题号格式：数字+点/顿号、括号数字、中文数字+逗号、圆圈数字等
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

/**
 * 智能导入OCR结果到数据库
 */
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

      // 自动匹配知识标签（题目内容 + 答案内容 + 解析内容）
      let matchedTagIds: string[] = [];
      if (autoMatchTags && parsed.content) {
        try {
          // 合并内容：题目 + 答案 + 解析，【标注】内容在答案中
          const combinedContent = [
            parsed.content,
            parsed.answer || '',
            parsed.analysis || ''
          ].join(' ');
          matchedTagIds = await autoMatchKnowledgeTags(combinedContent, parsed.title);
        } catch (tagError) {
          console.error('[Import Warning] 自动打标签失败，跳过:', tagError);
          // 打标签失败不影响导入，继续
          matchedTagIds = [];
        }
      }

      // 确定题目类型
      const questionType = detectQuestionType(parsed.content);

      // 估算难度
      const difficulty = estimateDifficulty(parsed.content);

      // 去除题干开头的题号
      const cleanedContent = stripQuestionNumber(parsed.content);

      // 创建题目
      const question = await prisma.question.create({
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
        },
      });

      // 关联知识标签
      if (matchedTagIds.length > 0) {
        for (const tagId of matchedTagIds) {
          await prisma.questionKnowledgeTag.create({
            data: {
              questionId: question.id,
              knowledgeTagId: tagId,
            },
          });
        }
      }

      result.success++;
      // 获取匹配的标签详情
      let matchedTagDetails: Array<{id: string; name: string; path: string; hierarchy: any}> = [];
      if (matchedTagIds.length > 0) {
        const matchedTags = await prisma.knowledgeTag.findMany({
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

/**
 * 自动匹配知识标签
 * 利用全部知识标签的名称和层级信息智能匹配
 * 返回匹配标签ID列表（最多5个标签的各自身+父级，去重）
 */
export async function autoMatchKnowledgeTags(content: string, title?: string): Promise<string[]> {
  const searchText = (title ? title + ' ' : '') + content;
  const searchTextLower = searchText.toLowerCase();
  const matchedScores: Array<{ tagId: string; score: number; tagName: string; level: number; tag: any }> = [];

  // 获取所有级别的知识标签（1-5级），包含完整层级
  const allTags = await prisma.knowledgeTag.findMany({
    include: {
      parent: {
        include: {
          parent: {
            include: {
              parent: {
                include: {
                  parent: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // 为每个标签构建搜索词（标签名 + 所有父级名称 + 显式关键词库）
  for (const tag of allTags) {
    const parentNames = getParentNames(tag);
    const explicitKeywords = knowledgeKeywords[tag.name] || [];
    // 去重合并：标签名、父级名、显式关键词
    const allKeywords = [...new Set([tag.name, ...parentNames, ...explicitKeywords])];
    let score = 0;

    for (const keyword of allKeywords) {
      const keywordLower = keyword.toLowerCase();
      if (!keywordLower) continue;

      // 标题中的关键词权重更高
      if (title && title.toLowerCase().includes(keywordLower)) {
        score += 3;
      }

      // 内容中的关键词（includes 对中英文都有效）
      if (searchTextLower.includes(keywordLower)) {
        score += 1;
      }

      // 精确匹配（完整词/短语匹配）权重更高
      // 对中文关键词：检查是否被标点/空格/字符串边界包围
      // 对英文/数字关键词：使用 \b 词边界
      try {
        const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let exactHit = false;

        // 判断是否为中文关键词（含CJK字符）
        if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(keywordLower)) {
          // 中文：检查关键词前后是否有边界（空格、标点、字符串起止）
          const cjkBoundary = `(?:^|\\s|[，。！？；：""''（）【】《》])${escaped}(?:$|\\s|[，。！？；：""''（）【】《》])`;
          const cjkRegex = new RegExp(cjkBoundary, 'i');
          if (cjkRegex.test(searchText)) {
            exactHit = true;
          }
        } else {
          // 英文/数字：使用 \b 词边界
          const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');
          if (wordRegex.test(searchTextLower)) {
            exactHit = true;
          }
        }

        if (exactHit) {
          score += 2;
        }
      } catch (e) {
        // 正则表达式无效时跳过精确匹配
      }
    }

    if (score > 0) {
      matchedScores.push({ tagId: tag.id, score, tagName: tag.name, level: tag.level, tag });
    }
  }

  // 按分数降序，分数相同时优先级别高的（更精细的标签）
  matchedScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.level - a.level;
  });

  // 取分数 > 0 的前5个匹配（不再只取第1个）
  const topMatches = matchedScores.filter(m => m.score > 0).slice(0, 5);

  if (topMatches.length === 0) {
    console.log(`[标签匹配] 未找到匹配标签`);
    return [];
  }

  // 每个匹配标签 + 其所有父级，合并去重
  const resultIds: string[] = [];
  const seenIds = new Set<string>();

  for (const match of topMatches) {
    console.log(`[标签匹配] 匹配: [L${match.level}] ${match.tagName} (分数: ${match.score})`);
    const tagWithParents = getTagAndParentIds(match.tag);
    for (const id of tagWithParents) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        resultIds.push(id);
      }
    }
  }

  console.log(`[标签匹配] 共 ${topMatches.length} 个匹配标签，含父级共 ${resultIds.length} 个标签ID`);
  return resultIds;
}

/**
 * 获取标签的所有父级名称（用于构建搜索文本）
 */
function getParentNames(tag: any): string[] {
  const names: string[] = [];
  let current = tag.parent;
  while (current) {
    names.push(current.name);
    current = current.parent;
  }
  return names;
}

/**
 * 获取标签及其所有父级标签的ID列表
 */
function getTagAndParentIds(tag: any): string[] {
  const ids: string[] = [tag.id];
  
  // 遍历父级层级获取所有祖先标签ID
  // level 5 -> level 4 -> level 3 -> level 2 -> level 1
  let current = tag;
  while (current.parent) {
    ids.push(current.parent.id);
    current = current.parent;
  }
  
  return ids;
}

/**
 * 获取题目的知识标签路径（用于展示）
 */
export async function getQuestionTagPaths(questionId: string): Promise<string[]> {
  const questionTags = await prisma.questionKnowledgeTag.findMany({
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

/**
 * 检测题目类型 - 限定为四类：填空题、选择题、解答题、计算题
 */
export function detectQuestionType(content: string): QuestionType {
  const lowerContent = content.toLowerCase();

  // 1. 检测计算题（优先级最高）
  // 特征：包含计算、口算、脱式、竖式等关键词，或纯算式
  if (/计算|口算|脱式|竖式|简便计算|递等式|直接写得数/.test(content)) {
    // 如果同时有横线填空，可能是填空形式的计算题
    if (/[_\(\)（）]+/.test(content) && !/=/.test(content)) {
      return QuestionType.FILL_BLANK;
    }
    return QuestionType.CALCULATION;
  }

  // 2. 检测选择题
  // 特征：包含选项A/B/C/D，或有"选择"字样
  if (/[A-D][\.、\s]/.test(content) || /选项|选择/.test(content)) {
    return QuestionType.CHOICE;
  }

  // 3. 检测填空题
  // 特征：包含横线、括号等待填位置
  if (/[_\(\)（）]+|____|□/.test(content) || /填空/.test(content)) {
    return QuestionType.FILL_BLANK;
  }

  // 4. 默认为解答题
  // 应用题、几何证明、文字叙述题等都归为解答题
  return QuestionType.SOLUTION;
}

/**
 * 估算题目难度
 */
export function estimateDifficulty(content: string): number {
  let difficulty = 2; // 默认难度

  // 根据内容长度估算
  if (content.length > 200) difficulty += 1;
  if (content.length > 500) difficulty += 1;

  // 根据关键词估算
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

  // 限制在1-5范围内
  return Math.max(1, Math.min(5, difficulty));
}
