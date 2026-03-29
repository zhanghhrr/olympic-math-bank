/**
 * OCR结果导入数据库
 * 包含智能标签匹配功能
 */

import { PrismaClient, QuestionType, Grade, QuestionStatus } from '@prisma/client';
import { ParsedQuestion } from './mineru-client';
import { knowledgeKeywords, getTagPath, getTagHierarchy } from './knowledge-keywords';

const prisma = new PrismaClient();

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
        // 合并内容：题目 + 答案 + 解析，【标注】内容在答案中
        const combinedContent = [
          parsed.content,
          parsed.answer || '',
          parsed.analysis || ''
        ].join(' ');
        matchedTagIds = await autoMatchKnowledgeTags(combinedContent, parsed.title);
      }

      // 确定题目类型
      const questionType = detectQuestionType(parsed.content);

      // 估算难度
      const difficulty = estimateDifficulty(parsed.content);

      // 创建题目
      const question = await prisma.question.create({
        data: {
          content: parsed.content,
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
 * 根据题目内容智能匹配五级知识标签
 * 返回匹配的标签ID列表（最多5个）
 */
async function autoMatchKnowledgeTags(content: string, title?: string): Promise<string[]> {
  const matchedTagIds: string[] = [];
  const searchText = (title + ' ' + content).toLowerCase();
  const matchedScores: Array<{ tagId: string; score: number; tagName: string; level: number; tag: any }> = [];

  // 获取所有级别的知识标签（1-5级）
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

  // 匹配标签并计算匹配分数
  for (const tag of allTags) {
    const keywords = knowledgeKeywords[tag.name] || [tag.name];
    let score = 0;

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      // 标题中的关键词权重更高
      if (title && title.toLowerCase().includes(keywordLower)) {
        score += 3;
      }
      // 内容中的关键词
      if (searchText.includes(keywordLower)) {
        score += 1;
      }
      // 精确匹配（完整词匹配）权重更高
      // 转义正则表达式特殊字符
      const escapedKeyword = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        const exactMatch = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
        if (exactMatch.test(searchText)) {
          score += 2;
        }
      } catch (e) {
        // 如果正则表达式无效，跳过精确匹配
      }
    }

    if (score > 0) {
      matchedScores.push({ tagId: tag.id, score, tagName: tag.name, level: tag.level, tag });
    }
  }

  // 按分数排序，优先选择级别高（更精细）的标签
  matchedScores.sort((a, b) => {
    // 首先按分数排序
    if (b.score !== a.score) return b.score - a.score;
    // 分数相同，按级别排序（高级别优先）
    return b.level - a.level;
  });

  // 取前5个最匹配的标签
  const topMatches = matchedScores.slice(0, 5);

  console.log(`[标签匹配] 找到 ${matchedScores.length} 个匹配标签，选择前 ${topMatches.length} 个:`);
  topMatches.forEach(m => {
    const path = getTagPath(m.tag);
    console.log(`  - [L${m.level}] ${m.tagName} (分数: ${m.score}) - ${path}`);
  });

  return topMatches.map(m => m.tagId);
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
function detectQuestionType(content: string): QuestionType {
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
function estimateDifficulty(content: string): number {
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
