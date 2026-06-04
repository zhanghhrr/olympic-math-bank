import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

/**
 * 去除题干开头的题号
 */
function stripQuestionNumber(content: string): string {
  if (!content) return content;
  const pattern = /^\s*(\d+[\.、．]|第\s*\d+\s*题|[一二三四五六七八九十]+[、，,]|[\(（]\s*\d+\s*[\)）]|[\[【]?\d+[\]】]?|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|[ⅰⅱⅲⅳⅴ]+[.、])\s*/;
  return content.replace(pattern, '');
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const grade = searchParams.get('grade');
  const difficulty = searchParams.get('difficulty');
  const search = searchParams.get('search');
  const createdById = searchParams.get('createdById');
  const tagIds = searchParams.get('tagIds');
  const knowledgeTagIds = searchParams.get('knowledgeTagIds');

  const where: any = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (grade) where.grade = grade;
  if (difficulty) where.difficulty = parseInt(difficulty);
  if (createdById) where.createdById = createdById;
  if (search) {
    where.OR = [
      { content: { contains: search } },
      { source: { contains: search } },
      { solution: { contains: search } },
    ];
  }

  // 标签筛选
  if (tagIds) {
    const tagIdArray = tagIds.split(',');
    where.tags = {
      some: {
        tagId: { in: tagIdArray },
      },
    };
  }

  // 知识标签筛选
  if (knowledgeTagIds) {
    const knowledgeTagIdArray = knowledgeTagIds.split(',');
    where.knowledgeTags = {
      some: {
        knowledgeTagId: { in: knowledgeTagIdArray },
      },
    };
  }

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
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
        _count: { select: { reviews: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.question.count({ where }),
  ]);

  return NextResponse.json({
    questions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { content, answer, solution, type, options, grade, difficulty, source, year, competition, tagIds, knowledgeTagIds } = body;

  const question = await prisma.question.create({
    data: {
      content: stripQuestionNumber(content),
      answer,
      solution,
      type,
      options: options ? JSON.stringify(options) : null,
      grade,
      difficulty,
      source,
      year,
      competition,
      createdById: (session.user as any).id as string,
      tags: tagIds ? { create: tagIds.map((id: string) => ({ tagId: id })) } : undefined,
      knowledgeTags: knowledgeTagIds ? { create: knowledgeTagIds.map((id: string) => ({ knowledgeTagId: id })) } : undefined,
    },
    include: { 
      tags: { include: { tag: true } },
      knowledgeTags: { include: { knowledgeTag: true } },
    },
  });

  return NextResponse.json(question, { status: 201 });
}
