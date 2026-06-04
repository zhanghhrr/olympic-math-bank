/**
 * 确认导入API
 * 将预览的题目写入数据库（批量事务），状态为PENDING
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { QuestionStatus, Grade } from '@prisma/client';
import { autoMatchKnowledgeTagsWithLLM, detectQuestionType, estimateDifficulty, stripQuestionNumber } from '@/lib/ocr/import-to-db';
import { HybridQuestionIdentifier } from '@/lib/ocr/question-identifier';
import { verifyFormulasFromJson, serializeVerifiedFormulas } from '@/lib/ocr/formula-verifier';
import { batchCheckDuplicates } from '@/lib/ocr/dedup';

interface QuestionPreview {
  tempId?: string;
  content: string;
  answer: string;
  solution: string;
  type: string;
  difficulty: number;
  grade: string;
  source: string;
  matchedTags: Array<{ id: string; name: string; path: string }>;
  formulas?: string;
  sourceBlocks?: string;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { questions } = body as { questions: QuestionPreview[] };

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: '缺少题目列表' }, { status: 400 });
    }

    let userId: string;
    const sessionUserId = (session?.user as any)?.id;
    if (sessionUserId) {
      userId = sessionUserId as string;
    } else {
      let defaultUser = await prisma.user.findFirst({
        where: { email: 'admin@example.com' },
      });
      if (!defaultUser) {
        defaultUser = await prisma.user.create({
          data: { email: 'admin@example.com', name: '管理员', role: 'ADMIN' },
        });
      }
      userId = defaultUser.id;
    }

    // 预处理所有题目数据
    const preparedQuestions = await Promise.all(
      questions.map(async (q) => {
        // 标签匹配
        let matchedTagIds: string[] = [];
        const frontendTagIds = (q.matchedTags || []).map((t) => t.id).filter(Boolean);
        if (frontendTagIds.length > 0) {
          matchedTagIds = [...new Set(frontendTagIds)];
        } else {
          try {
            const combinedContent = [q.content, q.answer, q.solution].join(' ');
            matchedTagIds = await autoMatchKnowledgeTagsWithLLM(combinedContent);
          } catch (tagError) {
            console.error('[Confirm Import] 自动打标签失败:', tagError);
          }
        }

        const cleanedContent = stripQuestionNumber(q.content);
        const questionType = HybridQuestionIdentifier.questionTypeToDB(
          detectQuestionType(q.content),
        );
        const difficulty = q.difficulty || estimateDifficulty(q.content);

        let verifiedFormulas = q.formulas || null;
        if (q.formulas) {
          try {
            const vr = verifyFormulasFromJson(q.formulas);
            if (vr) verifiedFormulas = serializeVerifiedFormulas(vr);
          } catch {
            verifiedFormulas = q.formulas;
          }
        }

        return {
          content: cleanedContent,
          answer: q.answer || '',
          solution: q.solution || '',
          type: questionType,
          grade: (q.grade as Grade) || Grade.P3,
          difficulty,
          source: q.source || 'OCR导入',
          status: QuestionStatus.PENDING,
          createdById: userId,
          formulas: verifiedFormulas,
          sourceBlocks: q.sourceBlocks || null,
          tagIds: matchedTagIds,
        };
      }),
    );

    // 去重检查：检测重复题目，标记但不阻止导入
    const dedupResults = await batchCheckDuplicates(
      preparedQuestions.map(pq => pq.content)
    );
    const dupCount = dedupResults.filter(r => r.isDuplicate).length;
    if (dupCount > 0) {
      console.log(`[Confirm Import] 发现 ${dupCount} 道可能重复的题目`);
    }

    // 批量创建题目（单事务）
    const createdQuestions = await prisma.$transaction(
      preparedQuestions.map((pq) =>
        prisma.question.create({
          data: {
            content: pq.content,
            answer: pq.answer,
            solution: pq.solution,
            type: pq.type,
            grade: pq.grade,
            difficulty: pq.difficulty,
            source: pq.source,
            status: pq.status,
            createdById: pq.createdById,
            formulas: pq.formulas,
            sourceBlocks: pq.sourceBlocks,
          },
        }),
      ),
    );

    // 批量创建知识标签关联
    const tagRelations = createdQuestions.flatMap((q, i) =>
      preparedQuestions[i].tagIds.map((tagId) => ({
        questionId: q.id,
        knowledgeTagId: tagId,
      })),
    );

    if (tagRelations.length > 0) {
      await prisma.questionKnowledgeTag.createMany({
        data: tagRelations,
      });
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${createdQuestions.length} 道题目`,
      total: questions.length,
      successCount: createdQuestions.length,
      failedCount: 0,
    });
  } catch (error) {
    console.error('[Confirm Import] 确认导入失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '确认导入失败' },
      { status: 500 },
    );
  }
}
