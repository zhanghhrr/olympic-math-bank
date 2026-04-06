import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

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
                  parent: {
                    include: {
                      parent: {
                        include: {
                          parent: true,
                        },
                      },
                    },
                  },
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

  return NextResponse.json({ question });
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

  return NextResponse.json(question);
}
