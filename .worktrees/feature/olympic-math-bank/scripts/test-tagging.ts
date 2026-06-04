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

function calculateTagScoreInternal(content: string, tag: any, title?: string): number {
  const allKeywords = buildSearchKeywords(tag);
  const searchText = (title ? title + ' ' : '') + content;
  const searchTextLower = searchText.toLowerCase();
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
  return score;
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
    if (ancestorIdx !== -1) {
      unique[ancestorIdx] = match;
      continue;
    }
    const hasChild = unique.some(
      um => um.path.startsWith(match.path + ' > ') && um.path !== match.path
    );
    if (hasChild) { continue; }
    unique.push(match);
    if (unique.length >= maxTop) break;
  }
  return unique;
}

async function autoMatchTags(content: string, title?: string): Promise<string[]> {
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

  const topMatches = deduplicateByBranch(
    matchedScores.filter(m => m.score > 0), 5
  );
  if (topMatches.length === 0) return [];

  const resultIds: string[] = [];
  const seenIds = new Set<string>();
  for (const match of topMatches) {
    const tagWithParents = getTagAndParentIds(match.tag);
    for (const id of tagWithParents) {
      if (!seenIds.has(id)) { seenIds.add(id); resultIds.push(id); }
    }
  }
  return resultIds;
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
    source: '四位数好数',
    content: '如果一个四位数，它的各个数位上的数字互不相同，那么我们就称这个数为"好数"，那么这样的"好数"共有多少个？',
    answer: '4536',
    analysis: '千位不能为0有9种选择，百位有9种选择（可含0但不同于千位），十位有8种，个位有7种。根据乘法原理：9×9×8×7=4536。',
    expected: ['乘法原理', '组数'],
  },
  {
    source: '分苹果和梨',
    content: '有4个相同的苹果和5个相同的梨，要分给3个小朋友，要求每位小朋友都至少得到1个苹果和1个梨，那么共有____种不同的分法。',
    answer: '18',
    analysis: '苹果：每人先分1个，剩余1个分给3人（插板法），C(3+1-1,1)=3种。梨：每人先分1个，剩余2个分给3人，C(3+2-1,2)=6种。根据乘法原理：3×6=18种。',
    expected: ['加乘原理综合', '组合'],
  },
  {
    source: '多人相遇-行程',
    content: 'A、B两地相距3600米，甲从A地、乙和丙从B地同时出发，相向而行。甲每分钟走60米，乙每分钟走90米，丙每分钟走30米。当甲和丙相遇时，甲和乙相距多少米？',
    answer: '1200',
    analysis: '甲丙相遇时间=3600÷(60+30)=40分钟。40分钟后甲走了60×40=2400米，乙走了90×40=3600米，两人相距3600-2400=1200米。',
    expected: ['相遇问题'],
  },
  {
    source: '多人追及-行程',
    content: '快车、中车、慢车同时同地出发，沿同一公路追赶前面一个骑车人。这三辆车分别用6分钟、10分钟、12分钟追上骑车人。现在知道快车每小时行24千米，中车每小时行20千米，求慢车每小时行多少千米？',
    answer: '19',
    analysis: '设骑车人速度v，初始距离S。快车：S/(24-v)=6/60，中车：S/(20-v)=10/60。解得v=14，S=1。慢车速度=S÷(12/60)+14=5+14=19千米/小时。',
    expected: ['追及问题'],
  },
  {
    source: '鸡兔同笼',
    content: '鸡和兔共有30个头，88只脚，那么鸡有____只，兔有____只。',
    answer: '鸡16只，兔14只',
    analysis: '设鸡有x只，兔有y只。根据题意可得x+y=30，2x+4y=88。解方程得x=16，y=14。',
    expected: ['鸡兔同笼问题'],
  },
  {
    source: '长方形面积',
    content: '一个长方形的长是12厘米，宽是8厘米，这个长方形的面积是多少平方厘米？',
    answer: '96',
    analysis: '长方形面积=长×宽=12×8=96平方厘米。',
    expected: ['长正方形面积正求'],
  },
  {
    source: '等差数列',
    content: '计算：1+3+5+7+...+99 = ____。',
    answer: '2500',
    analysis: '这是首项为1、末项为99、公差为2的等差数列。项数=(99-1)÷2+1=50。等差数列求和=(首项+末项)×项数÷2=(1+99)×50÷2=2500。',
    expected: ['等差数列', '等差数列求和'],
  },
  {
    source: '分数加减',
    content: '计算：1/2 + 1/3 + 1/6 = ____。',
    answer: '1',
    analysis: '通分：3/6+2/6+1/6=6/6=1。',
    expected: ['分数加减'],
  },
  {
    source: '三角形面积',
    content: '一个三角形的底是10厘米，高是6厘米，这个三角形的面积是多少平方厘米？',
    answer: '30',
    analysis: '三角形面积=底×高÷2=10×6÷2=30平方厘米。',
    expected: ['三角形面积'],
  },
  {
    source: '圆周长',
    content: '一个圆的半径是5厘米，这个圆的周长是多少厘米？（π取3.14）',
    answer: '31.4',
    analysis: '圆的周长=2×π×半径=2×3.14×5=31.4厘米。',
    expected: ['圆的周长公式'],
  },
  {
    source: '质数与合数',
    content: '在10以内的自然数中，质数有哪几个？合数有哪几个？',
    answer: '质数：2,3,5,7；合数：4,6,8,9,10',
    analysis: '质数是只有1和它本身两个因数的数，合数是有大于1个因数的数。1既不是质数也不是合数。',
    expected: ['质数与合数'],
  },
  {
    source: '长方体体积',
    content: '一个长方体的长是4厘米，宽是3厘米，高是5厘米，这个长方体的体积是多少立方厘米？',
    answer: '60',
    analysis: '长方体体积=长×宽×高=4×3×5=60立方厘米。',
    expected: ['长方体的基本概念'],
  },
  {
    source: '标数法（网格路径）',
    content: '如图，从A点出发，每次只能向右或向上走一格，走到B点，共有多少条不同的最短路线？',
    answer: '10',
    analysis: '需向右3步，向上2步，共5步中选2步向上=C(5,2)=10。使用标数法解题。',
    expected: ['标数法', '标准标数法'],
  },
];

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  导入题目自动打标签 - 效果测试');
  console.log('═══════════════════════════════════════════════════════════\n');

  const allTags = await getTagTree();
  console.log(`📚 数据库标签总数: ${allTags.length}`);
  console.log(`📖 关键词库条目: ${Object.keys(knowledgeKeywords).length}`);
  console.log(`📝 测试用例: ${TEST_CASES.length} 道\n`);

  let totalExpected = 0;
  let totalHit = 0;
  let totalMatched = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const combined = [tc.content, tc.answer, tc.analysis].join(' ');

    const tagIds = await autoMatchTags(combined);
    const matched = tagIds
      .map(id => allTags.find(t => t.id === id))
      .filter(Boolean) as any[];

    const hitExpected = tc.expected.filter((e: string) =>
      matched.some((m: any) => m.name === e)
    );

    totalExpected += tc.expected.length;
    totalHit += hitExpected.length;
    totalMatched += matched.length;

    console.log(`${'─'.repeat(64)}`);
    console.log(`【${String(i+1).padStart(2,'0')}】${tc.source}`);
    console.log(`  📝 ${tc.content.substring(0, 70)}...`);

    const hitRate = tc.expected.length > 0
      ? `(${hitExpected.length}/${tc.expected.length})`
      : '(N/A)';
    console.log(`  🎯 期望命中 ${hitRate}: ${hitExpected.length > 0 ? hitExpected.map((e: string) => `✅${e}`).join(' ') : tc.expected.map((e: string) => `❌${e}`).join(' ')}`);

    if (tc.expected.length > hitExpected.length && hitExpected.length > 0) {
      const missed = tc.expected.filter((e: string) => !hitExpected.includes(e));
      console.log(`  ⚠️  遗漏: ${missed.map((e: string) => `❌${e}`).join(' ')}`);
    }

    const topScoring = matched
      .filter((m: any) => m.level >= 3)
      .slice(0, 5);
    console.log(`  🏷  匹配 (${matched.length}个，含父级):`);
    for (const m of topScoring) {
      const indent = '  '.repeat(Math.max(0, m.level - 2));
      const p = getTagFullPath(m);
      const kw = (knowledgeKeywords[m.name] || []).slice(0, 2).join(',');
      console.log(`    ${indent}L${m.level} [${m.name}] ${kw ? '← ' + kw : ''}`);
      console.log(`    ${indent}   ↳ ${p}`);
    }
  }

  const hitPct = totalExpected > 0 ? (totalHit/totalExpected*100).toFixed(1) : 'N/A';
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`\n📊 综合统计:`);
  console.log(`  期望标签数: ${totalExpected}`);
  console.log(`  命中数:     ${totalHit} / ${totalExpected}`);
  console.log(`  命中率:     ${hitPct}%`);
  console.log(`  平均每题匹配标签数(含父级): ${(totalMatched/TEST_CASES.length).toFixed(1)}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
