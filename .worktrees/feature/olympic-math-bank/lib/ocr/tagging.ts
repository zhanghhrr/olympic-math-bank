import { prisma } from '@/lib/db/prisma';
import { knowledgeKeywords, sectionTitleToTagNames, annotationToTagNames } from './knowledge-keywords';
import { isLLMAvailable, matchTagsViaLLM } from '@/lib/llm/client';

const tagTreeCache: Map<string, any[]> = new Map();

export function clearTagTreeCache(namespace?: string) {
  if (namespace) {
    tagTreeCache.delete(namespace);
  } else {
    tagTreeCache.clear();
  }
}

export async function getTagTree(namespace: string = 'default') {
  if (!tagTreeCache.has(namespace)) {
    const tags = await prisma.knowledgeTag.findMany({
      where: { namespace },
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
    });
    tagTreeCache.set(namespace, tags);
  }
  return tagTreeCache.get(namespace)!;
}

function isSingleCJK(keyword: string): boolean {
  const cjkOnly = keyword.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '');
  const cjkChars = keyword.length - cjkOnly.length;
  return cjkChars === 1 && cjkOnly.length === 0;
}

function getParentNames(tag: any): string[] {
  const names: string[] = [];
  let current = tag.parent;
  while (current) {
    names.push(current.name);
    current = current.parent;
  }
  return names;
}

function getTagAndParentIds(tag: any): string[] {
  const ids: string[] = [tag.id];
  let current = tag;
  while (current.parent) {
    ids.push(current.parent.id);
    current = current.parent;
  }
  return ids;
}

function getTagFullPath(tag: any): string {
  const parts: string[] = [];
  let current: any = tag;
  while (current) {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(' > ');
}

export interface TagMatchResult {
  tagId: string;
  tagName: string;
  score: number;
  level: number;
  tag: any;
  path: string;
}

export function calculateTagScore(
  content: string,
  tag: any,
  options?: { title?: string }
): number {
  const { ownKeywords, parentKeywords } = buildSearchKeywords(tag);
  const searchText = (options?.title ? options.title + ' ' : '') + content;
  const searchTextLower = searchText.toLowerCase();
  let score = 0;

  // 章节标题/标注直接映射加分：若 tag.name 被章节标题显式映射到，权重 ×2
  if (options?.title) {
    const parts = options.title.split(' | ');
    const sectionName = parts[0]?.trim();
    const annotationHint = parts[1]?.trim();

    if (sectionName && sectionTitleToTagNames[sectionName]) {
      const mappedTags = sectionTitleToTagNames[sectionName];
      if (mappedTags.includes(tag.name)) {
        score += 5;
      }
    }

    if (annotationHint) {
      const directKey = annotationToTagNames[annotationHint];
      if (directKey?.includes(tag.name)) {
        score += 5;
      }
      // 也尝试模糊匹配：标注文本中可能包含的标签词
      for (const [annoKey, annoTags] of Object.entries(annotationToTagNames)) {
        if (annotationHint.includes(annoKey) || annoKey.includes(annotationHint)) {
          if (annoTags.includes(tag.name)) {
            score += 3;
            break;
          }
        }
      }
    }
  }

  // 评分：自身关键词权重 1.0，父级关键词权重 0.3
  for (const keyword of ownKeywords) {
    const keywordLower = keyword.toLowerCase();
    if (!keywordLower) continue;

    if (options?.title && options.title.toLowerCase().includes(keywordLower)) {
      score += 3;
    }

    if (searchTextLower.includes(keywordLower)) {
      score += 1;
    }

    try {
      const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let exactHit = false;

      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(keywordLower)) {
        const cjkBoundary = `(?:^|\\s|[，。！？；：""''（）【】《》\\-+×÷=*\\/\\(\\)（）])${escaped}(?:$|\\s|[，。！？；：""''（）【】《》\\-+×÷=*\\/\\(\\)（）])`;
        if (new RegExp(cjkBoundary, 'i').test(searchText)) {
          exactHit = true;
        }
      } else {
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(searchTextLower)) {
          exactHit = true;
        }
      }

      if (exactHit) {
        score += 2;
      }
    } catch (_e) {
      /* skip invalid regex */
    }
  }

  // 父级关键词：权重 0.3（向上取整，最小 0）
  const PARENT_WEIGHT = 0.3;
  for (const keyword of parentKeywords) {
    const keywordLower = keyword.toLowerCase();
    if (!keywordLower) continue;

    if (searchTextLower.includes(keywordLower)) {
      score += Math.round(1 * PARENT_WEIGHT);
    }

    try {
      const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(keywordLower)) {
        const cjkBoundary = `(?:^|\\s|[，。！？；：""''（）【】《》\\-+×÷=*\\/\\(\\)（）])${escaped}(?:$|\\s|[，。！？；：""''（）【】《》\\-+×÷=*\\/\\(\\)（）])`;
        if (new RegExp(cjkBoundary, 'i').test(searchText)) {
          score += Math.round(2 * PARENT_WEIGHT);
        }
      } else {
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(searchTextLower)) {
          score += Math.round(2 * PARENT_WEIGHT);
        }
      }
    } catch (_e) {
      /* skip invalid regex */
    }
  }

  return score;
}

function buildSearchKeywords(tag: any): { ownKeywords: string[]; parentKeywords: string[] } {
  const parentNames = getParentNames(tag);
  const explicitKeywords = knowledgeKeywords[tag.name] || [];
  const ownKeywords = [...new Set([tag.name, ...explicitKeywords])].filter(kw => !isSingleCJK(kw));
  const parentKeywords = [...new Set(parentNames)].filter(kw => !isSingleCJK(kw)).filter(kw => !ownKeywords.includes(kw));
  return { ownKeywords, parentKeywords };
}

function deduplicateByBranch(matches: TagMatchResult[], maxTop: number): TagMatchResult[] {
  const sorted = [...matches].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.level - a.level;
  });

  const unique: TagMatchResult[] = [];

  for (const match of sorted) {
    const ancestorIdx = unique.findIndex(
      um => match.path.startsWith(um.path + ' > ') && match.path !== um.path
    );
    if (ancestorIdx !== -1) {
      unique[ancestorIdx] = match;
      continue;
    }

    const hasChild = unique.some(
      um => um.path.startsWith(match.path + ' > ') && um.path !== match.path
    );
    if (hasChild) {
      continue;
    }

    unique.push(match);
    if (unique.length >= maxTop) break;
  }

  return unique;
}

export async function autoMatchKnowledgeTags(
  content: string,
  title?: string
): Promise<string | null> {
  const result = await autoMatchKnowledgeTagsWithScores(content, title);
  return result.bestTagId;
}

const LLM_FALLBACK_THRESHOLD = 3;

/** 从匹配结果中取最高分的单个标签ID */
function getBestTagId(topMatches: TagMatchResult[]): string | null {
  if (topMatches.length === 0) return null;
  // 取最高分且层级最深（>=3，即子专题及以上）的标签
  const leafMatches = topMatches.filter(m => m.level >= 3);
  const best = leafMatches.length > 0 ? leafMatches[0] : topMatches[0];
  return best?.tagId ?? null;
}

export interface ScoredTag {
  tagId: string;
  tagName: string;
  score: number;
  path: string;
  level: number;
  matchSource: 'section_title' | 'annotation' | 'keyword' | 'llm';
}

function classifyMatchSource(tagName: string, title?: string): ScoredTag['matchSource'] {
  if (!title) return 'keyword';
  const parts = title.split(' | ');
  const sectionName = parts[0]?.trim();
  const annotationHint = parts[1]?.trim();

  if (sectionName && sectionTitleToTagNames[sectionName]) {
    if (sectionTitleToTagNames[sectionName].includes(tagName)) return 'section_title';
  }
  if (annotationHint) {
    if (annotationToTagNames[annotationHint]?.includes(tagName)) return 'annotation';
  }
  return 'keyword';
}

export async function autoMatchKnowledgeTagsWithLLM(
  content: string,
  title?: string
): Promise<string | null> {
  const result = await autoMatchKnowledgeTagsWithScores(content, title);
  return result.bestTagId;
}

export async function autoMatchKnowledgeTagsWithScores(
  content: string,
  title?: string
): Promise<{ bestTagId: string | null; scoredTags: ScoredTag[] }> {
  const allTags = await getTagTree();
  const searchText = (title ? title + ' ' : '') + content;
  const matchedScores: TagMatchResult[] = [];

  for (const tag of allTags) {
    const score = calculateTagScore(content, tag, title ? { title } : undefined);
    if (score > 0) {
      matchedScores.push({
        tagId: tag.id,
        tagName: tag.name,
        score,
        level: tag.level,
        tag,
        path: getTagFullPath(tag),
      });
    }
  }

  if (matchedScores.length === 0) {
    return { bestTagId: null, scoredTags: [] };
  }

  const sortedByScore = [...matchedScores].sort((a, b) => b.score - a.score);
  const maxScore = sortedByScore[0]?.score ?? 0;

  const topMatches = deduplicateByBranch(
    matchedScores.filter(m => m.score > 0),
    5
  );

  const leafMatches = topMatches.filter(m => m.level >= 3);
  const minLeafScore = leafMatches.length > 0
    ? Math.min(...leafMatches.map(m => m.score))
    : 0;

  const stableLeafMatches = leafMatches.filter(m => m.score >= LLM_FALLBACK_THRESHOLD);
  const hasEnoughStable = stableLeafMatches.length >= 2;

  const needsLLM = maxScore < LLM_FALLBACK_THRESHOLD
    || (!hasEnoughStable && minLeafScore < LLM_FALLBACK_THRESHOLD);

  if (!needsLLM || !isLLMAvailable()) {
    const bestTagId = getBestTagId(topMatches);
    const scoredTags: ScoredTag[] = topMatches.map(m => ({
      tagId: m.tagId,
      tagName: m.tagName,
      score: m.score,
      path: m.path,
      level: m.level,
      matchSource: classifyMatchSource(m.tagName, title),
    }));
    return { bestTagId, scoredTags };
  }

  const llmAddedTagNames = new Set<string>();
  try {
    const topCandidates = sortedByScore.slice(0, 20);
    const llmResults = await matchTagsViaLLM(
      searchText,
      topCandidates.map((m) => ({ name: m.tagName, path: m.path, level: m.level }))
    );
    if (llmResults.length > 0) {
      const staticTagNames = new Set(topMatches.map(m => m.tagName));
      for (const result of llmResults) {
        if (staticTagNames.has(result.tagName)) continue;
        const tag = allTags.find(t => t.name === result.tagName);
        if (!tag) continue;
        staticTagNames.add(result.tagName);
        llmAddedTagNames.add(result.tagName);
        topMatches.push({
          tagId: tag.id, tagName: tag.name, score: result.confidence,
          level: tag.level, tag, path: getTagFullPath(tag),
        });
      }
    }
  } catch (err) {
    console.warn('[Tagging] LLM 兜底失败，回退到静态匹配:', (err as Error).message);
  }

  const bestTagId = getBestTagId(topMatches);
  const scoredTags: ScoredTag[] = topMatches.map(m => ({
    tagId: m.tagId, tagName: m.tagName, score: m.score, path: m.path, level: m.level,
    matchSource: llmAddedTagNames.has(m.tagName) ? 'llm' : classifyMatchSource(m.tagName, title),
  }));
  return { bestTagId, scoredTags };
}
