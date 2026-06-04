/**
 * 双引擎公式交叉验证
 *
 * 对比 MinerU 和 SimpleTex 两个 OCR 引擎的 LaTeX 输出，标注差异行。
 * SimpleTex 为可选引擎——需配置 SIMPLETEX_API_TOKEN 环境变量。
 */

interface FormulaPair {
  mineru: string;
  simpletex?: string;
}

export interface DiffResult {
  mineruLatex: string;
  simpletexLatex: string | null;
  hasSimpletex: boolean;
  hasDiff: boolean;
  diffDetail: string;
  agreement: number;
}

function normalizeLatex(latex: string): string {
  return latex
    .replace(/\s+/g, '')
    .replace(/\\displaystyle/g, '')
    .replace(/\\limits/g, '')
    .replace(/\{(\d)\}/g, '$1')
    .toLowerCase();
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

function computeAgreement(a: string, b: string): number {
  const normA = normalizeLatex(a);
  const normB = normalizeLatex(b);
  if (normA === normB) return 1;
  const maxLen = Math.max(normA.length, normB.length);
  const dist = levenshteinDistance(normA, normB);
  return Math.max(0, 1 - dist / maxLen);
}

function generateDiffDetail(mineru: string, simpletex: string): string {
  const issues: string[] = [];

  const normM = normalizeLatex(mineru);
  const normS = normalizeLatex(simpletex);

  if (normM !== normS) {
    if (Math.abs(mineru.length - simpletex.length) > 5) {
      issues.push('长度差异显著');
    }

    const mineruFracs = (mineru.match(/\\frac/g) || []).length;
    const simpletexFracs = (simpletex.match(/\\frac/g) || []).length;
    if (mineruFracs !== simpletexFracs) {
      issues.push(`分数数量不同 (M:${mineruFracs} S:${simpletexFracs})`);
    }

    const mineruSqrt = (mineru.match(/\\sqrt/g) || []).length;
    const simpletexSqrt = (simpletex.match(/\\sqrt/g) || []).length;
    if (mineruSqrt !== simpletexSqrt) {
      issues.push(`根号数量不同 (M:${mineruSqrt} S:${simpletexSqrt})`);
    }

    const mineruSum = (mineru.match(/\\sum/g) || []).length;
    const simpletexSum = (simpletex.match(/\\sum/g) || []).length;
    if (mineruSum !== simpletexSum) {
      issues.push(`求和符号数量不同 (M:${mineruSum} S:${simpletexSum})`);
    }
  }

  return issues.length > 0 ? issues.join('; ') : '轻微差异';
}

export function compareFormulas(mineruLatex: string, simpletexLatex?: string): DiffResult {
  if (!simpletexLatex) {
    return {
      mineruLatex,
      simpletexLatex: null,
      hasSimpletex: false,
      hasDiff: false,
      diffDetail: '无 SimpleTex 结果',
      agreement: 1,
    };
  }

  const agreement = computeAgreement(mineruLatex, simpletexLatex);
  const hasDiff = agreement < 0.95;

  return {
    mineruLatex,
    simpletexLatex,
    hasSimpletex: true,
    hasDiff,
    diffDetail: hasDiff ? generateDiffDetail(mineruLatex, simpletexLatex) : '一致',
    agreement: Math.round(agreement * 100) / 100,
  };
}

export function batchCompareFormulas(
  mineruFormulas: string[],
  simpletexFormulas?: string[],
): DiffResult[] {
  return mineruFormulas.map((mf, idx) =>
    compareFormulas(mf, simpletexFormulas?.[idx]),
  );
}

export function getCompareSummary(results: DiffResult[]): {
  total: number;
  withSimpletex: number;
  matchCount: number;
  diffCount: number;
  avgAgreement: number;
} {
  const withSimpletex = results.filter(r => r.hasSimpletex);
  const matchCount = withSimpletex.filter(r => !r.hasDiff).length;
  const diffCount = withSimpletex.filter(r => r.hasDiff).length;
  const avgAgreement = withSimpletex.length > 0
    ? Math.round(withSimpletex.reduce((sum, r) => sum + r.agreement, 0) / withSimpletex.length * 100) / 100
    : 1;

  return {
    total: results.length,
    withSimpletex: withSimpletex.length,
    matchCount,
    diffCount,
    avgAgreement,
  };
}

export function isSimpletexAvailable(): boolean {
  return !!process.env.SIMPLETEX_API_TOKEN;
}
