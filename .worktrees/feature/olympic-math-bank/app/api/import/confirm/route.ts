/**
 * 确认导入API
 * 将预览的题目真正写入数据库，状态为PENDING
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { QuestionStatus, Grade } from '@prisma/client';
import { autoMatchKnowledgeTagsWithLLM, detectQuestionType, estimateDifficulty, stripQuestionNumber } from '@/lib/ocr/import-to-db';
import { HybridQuestionIdentifier } from '@/lib/ocr/question-identifier';
import { verifyFormulasFromJson, serializeVerifiedFormulas } from '@/lib/ocr/formula-verifier';

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

    // 获取或创建用户
    let userId: string;
    const sessionUserId = (session?.user as any)?.id;
    if (sessionUserId) {
      userId = sessionUserId as string;
    } else {
      let defaultUser = await prisma.user.findFirst({
        where: { email: 'admin@example.com' }
      });
      if (!defaultUser) {
        defaultUser = await prisma.user.create({
          data: {
            email: 'admin@example.com',
            name: '管理员',
            role: 'ADMIN',
          }
        });
      }
      userId = defaultUser.id;
    }

    const results: Array<{ success: boolean; questionId?: string; error?: string }> = [];
    let successCount = 0;

    for (const q of questions) {
      try {
        // 优先使用前端传来的已选标签；否则自动匹配
        let matchedTagIds: string[] = [];
        const frontendTagIds = (q.matchedTags || []).map((t: any) => t.id).filter(Boolean);
        if (frontendTagIds.length > 0) {
          matchedTagIds = [...new Set(frontendTagIds)];
          console.log(`[Confirm Import] 使用前端已选标签 ${matchedTagIds.length} 个`);
        } else {
          try {
            const combinedContent = [q.content, q.answer, q.solution].join(' ');
            matchedTagIds = await autoMatchKnowledgeTagsWithLLM(combinedContent);
            console.log(`[Confirm Import] 自动匹配标签 ${matchedTagIds.length} 个`);
          } catch (tagError) {
            console.error('[Confirm Import] 自动打标签失败:', tagError);
          }
        }

        // 清理题干
        const cleanedContent = stripQuestionNumber(q.content);

        // 确定题目类型
        const questionType = HybridQuestionIdentifier.questionTypeToDB(detectQuestionType(q.content));

        // 估算难度
        const difficulty = estimateDifficulty(q.content);

        let verifiedFormulas = q.formulas || null;
        if (q.formulas) {
          try {
            const verifyResult = verifyFormulasFromJson(q.formulas);
            if (verifyResult) {
              verifiedFormulas = serializeVerifiedFormulas(verifyResult);
            }
          } catch {
            verifiedFormulas = q.formulas;
          }
        }

        // 创建题目
        const question = await prisma.question.create({
          data: {
            content: cleanedContent,
            answer: q.answer || '',
            solution: q.solution || '',
            type: questionType,
            grade: (q.grade as Grade) || Grade.P3,
            difficulty: difficulty,
            source: q.source || 'OCR导入',
            status: QuestionStatus.PENDING,
            createdById: userId,
            formulas: verifiedFormulas,
            sourceBlocks: q.sourceBlocks || null,
          },
        });

        // 关联知识标签
        if (matchedTagIds.length > 0) {
          await prisma.questionKnowledgeTag.createMany({
            data: matchedTagIds.map(tagId => ({
              questionId: question.id,
              knowledgeTagId: tagId,
            })),
          });
        }

        results.push({ success: true, questionId: question.id });
        successCount++;
      } catch (error) {
        console.error('[Confirm Import] 题目导入失败:', error);
        results.push({
          success: false,
          error: error instanceof Error ? error.message : '导入失败'
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${successCount} 道题目`,
      total: questions.length,
      successCount,
      failedCount: questions.length - successCount,
      results,
    });

  } catch (error) {
    console.error('[Confirm Import] 确认导入失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '确认导入失败' },
      { status: 500 }
    );
  }
}
