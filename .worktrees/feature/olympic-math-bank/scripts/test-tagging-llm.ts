import { PrismaClient } from '@prisma/client';
import { knowledgeKeywords } from '../lib/ocr/knowledge-keywords';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./lib/db/dev.db' } },
});

let tagTreeCache: any[] | null = null;

async function getTagTree() {
  if (!tagTreeCache) {
    tagTreeCache = await prisma.knowledgeTag.findMany({
      include: {
        parent: {
          include: {
            parent: {
              include: {
                parent: { include: { parent: true } },
              },
            },
          },
        },
      },
    });
  }
  return tagTreeCache;
}

function isSingleCJK(keyword: string): boolean {
  const cjkOnly = keyword.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '');
  const cjkChars = keyword.length - cjkOnly.length;
  return cjkChars === 1 && cjkOnly.length === 0;
}

function getParentNames(tag: any): string[] {
  const names: string[] = [];
  let current = tag.parent;
  while (current) { names.push(current.name); current = current.parent; }
  return names;
}

function getTagAndParentIds(tag: any): string[] {
  const ids: string[] = [tag.id];
  let current = tag;
  while (current.parent) { ids.push(current.parent.id); current = current.parent; }
  return ids;
}

function getTagFullPath(tag: any): string {
  const parts: string[] = [];
  let current: any = tag;
  while (current) { parts.unshift(current.name); current = current.parent; }
  return parts.join(' > ');
}

function buildSearchKeywords(tag: any): string[] {
  const parentNames = getParentNames(tag);
  const explicitKeywords = knowledgeKeywords[tag.name] || [];
  const allKeywords = [...new Set([tag.name, ...parentNames, ...explicitKeywords])];
  return allKeywords.filter(kw => !isSingleCJK(kw));
}

interface TagMatch {
  tagId: string;
  tagName: string;
  score: number;
  level: number;
  tag: any;
  path: string;
}

function deduplicateByBranch(matches: TagMatch[], maxTop: number): TagMatch[] {
  const sorted = [...matches].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.level - a.level;
  });
  const unique: TagMatch[] = [];
  for (const match of sorted) {
    const ancestorIdx = unique.findIndex(
      um => match.path.startsWith(um.path + ' > ') && match.path !== um.path
    );
    if (ancestorIdx !== -1) { unique[ancestorIdx] = match; continue; }
    const hasChild = unique.some(
      um => um.path.startsWith(match.path + ' > ') && um.path !== match.path
    );
    if (hasChild) { continue; }
    unique.push(match);
    if (unique.length >= maxTop) break;
  }
  return unique;
}

function scoredToTagIds(topMatches: TagMatch[]): string[] {
  const resultIds: string[] = [];
  const seenIds = new Set<string>();
  for (const match of topMatches) {
    const ids = getTagAndParentIds(match.tag);
    for (const id of ids) {
      if (!seenIds.has(id)) { seenIds.add(id); resultIds.push(id); }
    }
  }
  return resultIds;
}

async function autoMatchTags(content: string, title?: string) {
  const allTags = await getTagTree();
  const searchText = (title ? title + ' ' : '') + content;
  const searchTextLower = searchText.toLowerCase();
  const matchedScores: TagMatch[] = [];

  for (const tag of allTags) {
    const allKeywords = buildSearchKeywords(tag);
    let score = 0;
    for (const keyword of allKeywords) {
      const keywordLower = keyword.toLowerCase();
      if (!keywordLower) continue;
      if (title && title.toLowerCase().includes(keywordLower)) { score += 3; }
      if (searchTextLower.includes(keywordLower)) { score += 1; }
      try {
        const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let exactHit = false;
        if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(keywordLower)) {
          const cjkBoundary = `(?:^|\\s|[，。！？；：""''（）【】《》\\-+×÷=*\\/\\(\\)（）])${escaped}(?:$|\\s|[，。！？；：""''（）【】《》\\-+×÷=*\\/\\(\\)（）])`;
          if (new RegExp(cjkBoundary, 'i').test(searchText)) { exactHit = true; }
        } else {
          if (new RegExp(`\\b${escaped}\\b`, 'i').test(searchTextLower)) { exactHit = true; }
        }
        if (exactHit) { score += 2; }
      } catch (_e) {}
    }
    if (score > 0) {
      matchedScores.push({
        tagId: tag.id, tagName: tag.name, score,
        level: tag.level, tag, path: getTagFullPath(tag),
      });
    }
  }

  return { matchedScores, allTags };
}

async function callLLM(
  questionContent: string,
  candidates: Array<{ name: string; path: string; level: number }>
) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === 'your-deepseek-api-key') {
    console.log('  ⚠️  DEEPSEEK_API_KEY 未配置，跳过 LLM 调用');
    return [];
  }

  const candidatesText = candidates
    .map((t, i) => `${i + 1}. [${t.name}] ${t.path}`)
    .join('\n');

  const prompt = `你是一位小学数学竞赛教研专家。请根据以下题目的内容，从候选标签列表中选出最匹配的 3-5 个知识点标签。

【题目内容】
${questionContent.substring(0, 2000)}

【候选标签】（仅能从中选择，不可编造新标签）
${candidatesText}

请以 JSON 数组格式返回结果，每个元素包含：
- tagName: 精确的标签名称（必须与候选列表完全一致）
- confidence: 0-100 的置信度分数
- reasoning: 10字以内的简短理由

只返回 JSON，不要其他内容。格式示例：
[{"tagName":"乘法原理","confidence":90,"reasoning":"分步计数"}]`;

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: '你是小学数学竞赛教研专家，只从候选列表中选择标签，返回纯JSON。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 800,
    }),
  });

  const data = await res.json() as any;
  const raw = data?.choices?.[0]?.message?.content || '[]';
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.tags || parsed.matches || []);
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

const TEST_CASES = [
  {
    source: '巧克力吃法（枚举）',
    content: '爸爸给了小鹏5块一样的巧克力，小鹏每天至少吃一块，直到吃完为止，那么他共有____种不同的吃法。',
    answer: '16',
    analysis: '根据题意，小鹏最少吃1天，最多吃5天。枚举：1天吃完1种；2天吃完4种；3天吃完6种；4天吃完4种；5天吃完1种。共16种。',
    expected: ['枚举法'],
  },
  {
    source: '垃圾桶排列',
    content: '厨余垃圾桶、可回收垃圾桶、有害垃圾桶和其他垃圾桶共4个垃圾桶摆成一排，其中厨余垃圾桶不能摆在最右边，那么一共有____种不同的摆法。',
    answer: '18',
    analysis: '先把3个无限制的垃圾桶排列：3×2×1=6种，厨余垃圾桶有3个位置可以插入（第1,2,3个位置），所以共有6×3=18种。',
    expected: ['排列', '乘法原理'],
  },
  {
    source: '分苹果和梨',
    content: '有4个相同的苹果和5个相同的梨，要分给3个小朋友，要求每位小朋友都至少得到1个苹果和1个梨，那么共有____种不同的分法。',
    answer: '18',
    analysis: '苹果：每人先分1个，剩余1个分给3人（插板法），C(3+1-1,1)=3种。梨：每人先分1个，剩余2个分给3人，C(3+2-1,2)=6种。根据乘法原理：3×6=18种。',
    expected: ['加乘原理综合', '组合'],
  },
  {
    source: '等差数列求和',
    content: '计算：1+3+5+7+...+99 = ____。',
    answer: '2500',
    analysis: '这是首项为1、末项为99、公差为2的等差数列。项数=(99-1)÷2+1=50。等差数列求和=(首项+末项)×项数÷2=(1+99)×50÷2=2500。',
    expected: ['等差数列', '等差数列求和'],
  },
  {
    source: '标数法（网格路径）',
    content: '如图，从A点出发，每次只能向右或向上走一格，走到B点，共有多少条不同的最短路线？',
    answer: '10',
    analysis: '需向右3步，向上2步，共5步中选2步向上=C(5,2)=10。使用标数法解题。',
    expected: ['标数法', '标准标数法'],
  },
];

const LLM_FALLBACK_THRESHOLD = 3;

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Layer 2 LLM 兜底 - 混合方案测试');
  console.log('═══════════════════════════════════════════════════════════\n');

  const llmAvailable = !!process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY !== 'your-deepseek-api-key';
  console.log(`🤖 LLM 状态: ${llmAvailable ? '✅ 已配置' : '⚠️ 未配置（仅静态匹配）'}\n`);

  let totalExpected = 0;
  let totalStaticHit = 0;
  let totalLLMHit = 0;
  let llmCallCount = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const combined = [tc.content, tc.answer, tc.analysis].join(' ');

    const { matchedScores, allTags } = await autoMatchTags(combined);

    const sortedByScore = [...matchedScores].sort((a, b) => b.score - a.score);
    const maxScore = sortedByScore[0]?.score ?? 0;

    const topMatches = deduplicateByBranch(
      matchedScores.filter(m => m.score > 0), 5
    );
    const staticIds = scoredToTagIds(topMatches);
    const staticNames = new Set(allTags.filter(t => staticIds.includes(t.id)).map(t => t.name));

    const staticHit = tc.expected.filter(e => staticNames.has(e));

    let llmHit: string[] = [];
    let usedLLM = false;

    const leafMatches = topMatches.filter((m: any) => m.level >= 3);
    const minLeafScore = leafMatches.length > 0
      ? Math.min(...leafMatches.map((m: any) => m.score))
      : 0;
    const stableLeafMatches = leafMatches.filter((m: any) => m.score >= LLM_FALLBACK_THRESHOLD);
    const hasEnoughStable = stableLeafMatches.length >= 2;
    const needsLLM = maxScore < LLM_FALLBACK_THRESHOLD
      || (!hasEnoughStable && minLeafScore < LLM_FALLBACK_THRESHOLD);

    if (needsLLM && llmAvailable) {
      llmCallCount++;
      usedLLM = true;
      const topCandidates = sortedByScore.slice(0, 20);
      const llmResults = await callLLM(
        combined,
        topCandidates.map((m: any) => ({ name: m.tagName, path: m.path, level: m.level }))
      );

      if (llmResults.length > 0) {
        const llmNames = new Set(llmResults.map((r: any) => r.tagName || r.name || ''));
        llmHit = tc.expected.filter(e => llmNames.has(e) && !staticNames.has(e));
      }
    }

    totalExpected += tc.expected.length;
    totalStaticHit += staticHit.length;
    totalLLMHit += llmHit.length;

    console.log(`${'─'.repeat(64)}`);
    console.log(`【${String(i + 1).padStart(2, '0')}】${tc.source}`);
    console.log(`  📝 ${tc.content.substring(0, 60)}...`);
    const triggerLabel = usedLLM ? ' → 🤖 触发LLM' : (needsLLM ? ' → ⚡ 需LLM但未配置' : ' → ✅ 静态足够');
    console.log(`  📊 max=${maxScore} | stable=${stableLeafMatches.length} | minLeaf=${minLeafScore} | 阈值: ${LLM_FALLBACK_THRESHOLD}${triggerLabel}`);

    const staticStatus = tc.expected.map(e => staticHit.includes(e) ? `✅${e}` : `❌${e}`).join(' ');
    console.log(`  🎯 静态命中 (${staticHit.length}/${tc.expected.length}): ${staticStatus}`);

    if (usedLLM) {
      const llmStatus = tc.expected.map(e => llmHit.includes(e) ? `✅${e}` : `❌${e}`).join(' ');
      const improved = llmHit.filter(e => !staticHit.includes(e));
      const extra = improved.length > 0 ? ` | 🆕 LLM补充: ${improved.map(e => `✅${e}`).join(' ')}` : '';
      console.log(`  🤖 LLM命中 (${llmHit.length}/${tc.expected.length}): ${llmStatus}${extra}`);
    }

    if (usedLLM && llmHit.length > 0) {
      const newHits = llmHit.filter(e => !staticHit.includes(e));
      if (newHits.length > 0) {
        console.log(`  🚀 LLM修复了 ${newHits.length} 个遗漏`);
      }
    }
  }

  const combinedHit = totalStaticHit + totalLLMHit;
  const staticPct = totalExpected > 0 ? (totalStaticHit / totalExpected * 100).toFixed(1) : 'N/A';
  const combinedPct = totalExpected > 0 ? (combinedHit / totalExpected * 100).toFixed(1) : 'N/A';

  console.log(`\n${'═'.repeat(64)}`);
  console.log(`\n📊 综合统计:`);
  console.log(`  期望标签数:   ${totalExpected}`);
  console.log(`  静态命中:     ${totalStaticHit} (${staticPct}%)`);
  console.log(`  LLM补充:      ${totalLLMHit}`);
  console.log(`  混合总命中:   ${combinedHit} (${combinedPct}%)`);
  console.log(`  LLM调用次数:  ${llmCallCount}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
