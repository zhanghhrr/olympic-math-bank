/**
 * 批量更新题目API
 * 支持批量更新题目内容、答案、解析、标签、状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ids, data } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '缺少题目ID列表' }, { status: 400 });
    }

    if (!data || Object.keys(data).length === 0) {
      return NextResponse.json({ error: '缺少更新数据' }, { status: 400 });
    }

    const { content, answer, solution, type, difficulty, grade, status, knowledgeTagIds } = data;

    // 构建更新数据
    const updateData: any = {};
    if (content !== undefined) updateData.content = content;
    if (answer !== undefined) updateData.answer = answer;
    if (solution !== undefined) updateData.solution = solution;
    if (type !== undefined) updateData.type = type;
    if (difficulty !== undefined) updateData.difficulty = difficulty;
    if (grade !== undefined) updateData.grade = grade;
    if (status !== undefined) updateData.status = status;

    // 执行批量更新
    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    // 事务处理知识标签更新和题目更新
    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        try {
          // 如果有知识标签更新，先删除现有标签再创建新的
          if (knowledgeTagIds !== undefined) {
            // 删除现有的知识标签关联
            await tx.questionKnowledgeTag.deleteMany({
              where: { questionId: id },
            });

            // 创建新的知识标签关联（替换模式）
            if (knowledgeTagIds.length > 0) {
              await tx.questionKnowledgeTag.createMany({
                data: knowledgeTagIds.map((tagId: string) => ({
                  questionId: id,
                  knowledgeTagId: tagId,
                })),
              });
            }
          }

          // 更新题目基本信息
          if (Object.keys(updateData).length > 0) {
            await tx.question.update({
              where: { id },
              data: updateData,
            });
          }

          results.success.push(id);
        } catch (error) {
          results.failed.push({
            id,
            error: error instanceof Error ? error.message : '更新失败',
          });
        }
      }
    });

    return NextResponse.json({
      success: results.success.length,
      failed: results.failed.length,
      results,
    });
  } catch (error) {
    console.error('批量更新失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批量更新失败' },
      { status: 500 }
    );
  }
}

/**
 * 批量删除题目（仅用于导入预览中识别错误的题目）
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '缺少题目ID列表' }, { status: 400 });
    }

    // 删除题目及其关联数据
    await prisma.$transaction(async (tx) => {
      // 删除知识标签关联
      await tx.questionKnowledgeTag.deleteMany({
        where: { questionId: { in: ids } },
      });

      // 删除普通标签关联
      await tx.questionTag.deleteMany({
        where: { questionId: { in: ids } },
      });

      // 删除审核记录
      await tx.review.deleteMany({
        where: { questionId: { in: ids } },
      });

      // 删除题目
      await tx.question.deleteMany({
        where: { id: { in: ids } },
      });
    });

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error('批量删除失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批量删除失败' },
      { status: 500 }
    );
  }
}
