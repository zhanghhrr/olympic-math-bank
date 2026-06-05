/**
 * 归一化题目类型：将旧版 SINGLE_CHOICE / MULTI_CHOICE / PROOF 映射为新版枚举值
 * Prisma QuestionType 枚举当前仅包含: FILL_BLANK | CHOICE | SOLUTION | CALCULATION
 */
export function normalizeQuestionType(type: string | undefined | null): string {
  if (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') return 'CHOICE';
  if (type === 'PROOF') return 'SOLUTION';
  return type || 'CHOICE';
}
