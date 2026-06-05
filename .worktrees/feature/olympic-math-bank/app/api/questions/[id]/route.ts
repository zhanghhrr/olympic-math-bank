import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { normalizeQuestionType } from '@/lib/utils/question-type';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      tags: { include: { tag: true } },
      knowledgeTags: {
        include: {
          knowledgeTag: {
            include: {
              parent: {
                include: {
                  parent: true, // 仅三层，减少不必要的五层嵌套
                },
              },
            },
          },
        },
      },
    },
  });

  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  return NextResponse.json({
    question: { ...question, type: normalizeQuestionType(question.type) },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { content, answer, solution, type, options, grade, difficulty, source, year, competition, tagIds, knowledgeTagIds } = body;

  // 保存版本快照：更新前先将当前题目数据写入 QuestionVersion
  const currentQuestion = await prisma.question.findUnique({
    where: { id },
    include: {
      knowledgeTags: { select: { knowledgeTagId: true } },
      tags: { select: { tagId: true } },
    },
  });

  if (currentQuestion) {
    const latestVersion = await prisma.questionVersion.findFirst({
      where: { questionId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const changedFields: string[] = [];
    const changes: string[] = [];
    
    if (currentQuestion.content !== content) {
      changedFields.push('题干');
      changes.push(`题干: "${currentQuestion.content?.substring(0, 30)}..." → "${content?.substring(0, 30)}..."`);
    }
    if (currentQuestion.answer !== answer) {
      changedFields.push('答案');
      changes.push(`答案变更`);
    }
    if (currentQuestion.solution !== (solution || null)) {
      changedFields.push('解析');
      changes.push(`解析变更`);
    }
    if (currentQuestion.type !== type) {
      changedFields.push('题型');
      changes.push(`题型: ${currentQuestion.type} → ${type}`);
    }
    if (currentQuestion.grade !== grade) {
      changedFields.push('年级');
      changes.push(`年级: ${currentQuestion.grade} → ${grade}`);
    }
    if (currentQuestion.difficulty !== difficulty) {
      changedFields.push('难度');
      changes.push(`难度: ${currentQuestion.difficulty} → ${difficulty}`);
    }

    const changeLog = changedFields.length > 0
      ? `修改了: ${changedFields.join('、')}。${changes.slice(0, 3).join('; ')}`
      : '修改了题目属性';

    await prisma.questionVersion.create({
      data: {
        questionId: id,
        version: nextVersion,
        content: currentQuestion.content,
        answer: currentQuestion.answer,
        solution: currentQuestion.solution,
        options: currentQuestion.options,
        formulas: currentQuestion.formulas,
        sourceBlocks: currentQuestion.sourceBlocks,
        changeLog,
        createdById: currentQuestion.createdById,
      },
    });
  }

  // 更新题目
  const question = await prisma.question.update({
    where: { id },
    data: {
      content,
      answer,
      solution,
      type,
      options: options ? JSON.stringify(options) : null,
      grade,
      difficulty,
      source,
      year,
      competition,
    },
  });

  // 更新标签
  if (tagIds !== undefined) {
    await prisma.questionTag.deleteMany({ where: { questionId: id } });
    if (tagIds.length > 0) {
      await prisma.questionTag.createMany({
        data: tagIds.map((tagId: string) => ({ questionId: id, tagId })),
      });
    }
  }

  // 更新知识标签
  if (knowledgeTagIds !== undefined) {
    await prisma.questionKnowledgeTag.deleteMany({ where: { questionId: id } });
    if (knowledgeTagIds.length > 0) {
      await prisma.questionKnowledgeTag.createMany({
        data: knowledgeTagIds.map((knowledgeTagId: string) => ({ questionId: id, knowledgeTagId })),
      });
    }
  }

  return NextResponse.json({ ...question, type: normalizeQuestionType(question.type) });
}
