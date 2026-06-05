import { prisma } from '@/lib/db/prisma';
import * as crypto from 'crypto';

const HASH_BITS = 64;
const SIMILARITY_THRESHOLD = 0.95;

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarity: number;
  existingQuestion?: {
    id: string;
    content: string;
    grade: string | null;
    source: string | null;
    createdAt: Date;
  };
}

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[\\${}()|[\]_.]/g, '')
    .toLowerCase()
    .trim();
}

function computeSimHash(text: string): bigint {
  const normalized = normalizeText(text);
  if (normalized.length < 3) return BigInt(0);

  const votes = new Array(HASH_BITS).fill(0);

  for (let i = 0; i <= normalized.length - 3; i++) {
    const trigram = normalized.substring(i, i + 3);
    const hash = crypto.createHash('md5').update(trigram).digest();
    const weight = 1;

    for (let bit = 0; bit < HASH_BITS && bit < hash.length * 8; bit++) {
      const byteIdx = Math.floor(bit / 8);
      const bitIdx = bit % 8;
      if ((hash[byteIdx] >> bitIdx) & 1) {
        votes[bit] += weight;
      } else {
        votes[bit] -= weight;
      }
    }
  }

  let fingerprint = BigInt(0);
  for (let bit = 0; bit < HASH_BITS; bit++) {
    if (votes[bit] > 0) {
      fingerprint |= BigInt(1) << BigInt(bit);
    }
  }
  return fingerprint;
}

function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let distance = 0;
  while (xor > BigInt(0)) {
    distance += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }
  return distance;
}

function computeSimilarity(a: bigint, b: bigint): number {
  const dist = hammingDistance(a, b);
  return 1 - dist / HASH_BITS;
}

export function computeFingerprint(content: string): string {
  return computeSimHash(content).toString(16).padStart(16, '0');
}

export async function checkDuplicates(
  content: string,
  excludeId?: string,
): Promise<DuplicateCheckResult> {
  try {
  const fp = computeSimHash(content);
  if (fp === BigInt(0)) return { isDuplicate: false, similarity: 0 };

  const questions = await prisma.question.findMany({
    where: excludeId ? { NOT: { id: excludeId } } : {},
    select: {
      id: true,
      content: true,
      grade: true,
      source: true,
      createdAt: true,
    },
    take: 500,
  });

  let bestSimilarity = 0;
  let bestMatch: DuplicateCheckResult['existingQuestion'] = undefined;

  for (const q of questions) {
    const qFp = computeSimHash(q.content);
    if (qFp === BigInt(0)) continue;
    const sim = computeSimilarity(fp, qFp);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestMatch = q;
    }
  }

  return {
    isDuplicate: bestSimilarity >= SIMILARITY_THRESHOLD,
    similarity: Math.round(bestSimilarity * 100) / 100,
    existingQuestion: bestSimilarity >= SIMILARITY_THRESHOLD ? bestMatch : undefined,
  };
  } catch (error) {
    console.error('[Dedup] checkDuplicates 出错，降级为不重复:', error);
    return { isDuplicate: false, similarity: 0 };
  }
}

export async function batchCheckDuplicates(
  contents: string[],
): Promise<DuplicateCheckResult[]> {
  try {
  const fingerprints = contents.map(c => computeSimHash(c));

  const allQuestions = await prisma.question.findMany({
    select: {
      id: true,
      content: true,
      grade: true,
      source: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 3000,
  });

  const questionFps = allQuestions.map(q => ({
    question: q,
    fp: computeSimHash(q.content),
  }));

  return contents.map((content, idx) => {
    const fp = fingerprints[idx];
    if (fp === BigInt(0)) return { isDuplicate: false, similarity: 0 };

    let bestSimilarity = 0;
    let bestMatch: DuplicateCheckResult['existingQuestion'] = undefined;

    for (const { question, fp: qFp } of questionFps) {
      if (qFp === BigInt(0)) continue;
      const sim = computeSimilarity(fp, qFp);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = question;
      }
    }

    return {
      isDuplicate: bestSimilarity >= SIMILARITY_THRESHOLD,
      similarity: Math.round(bestSimilarity * 100) / 100,
      existingQuestion: bestSimilarity >= SIMILARITY_THRESHOLD ? bestMatch : undefined,
    };
  });
  } catch (error) {
    console.error('[Dedup] batchCheckDuplicates 出错，降级为全部不重复:', error);
    return contents.map(() => ({ isDuplicate: false, similarity: 0 }));
  }
}
