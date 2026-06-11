import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { normalizeQuestionType } from '@/lib/utils/question-type';

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
  const hasImage = searchParams.get('hasImage') === 'true';
  const hasSolution = searchParams.get('hasSolution') === 'true';
  const sortBy = searchParams.get('sortBy') || 'updatedAt';
  const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

  // 白名单校验排序字段，防止 SQL 注入
  const allowedSortFields = ['createdAt', 'updatedAt', 'difficulty', 'grade'];
  const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'updatedAt';
  const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

  const userId = (session.user as any).id as string;
  const userRole = (session.user as any).role || 'EDITOR';

  const where: any = {};

  // === 可见性范围控制 ===
  // 规则：DRAFT/REJECTED 仅创建者可见，PENDING 仅审核中心可见，APPROVED 所有人可见
  if (userRole === 'ADMIN' || userRole === 'REVIEWER') {
    // 管理员/审核员：无限制，按前端传入参数过滤
    if (status) where.status = status;
    if (createdById) where.createdById = createdById;
  } else {
    // 编辑者：受限可见
    if (status === 'DRAFT' || status === 'REJECTED') {
      // 草稿和已拒绝：仅创建者可见
      where.status = status;
      where.createdById = userId;
    } else if (status === 'PENDING') {
      // 待审核：仅审核中心可见（编辑者只能看到自己提交的）
      where.status = status;
      where.createdById = userId;
    } else if (status === 'APPROVED') {
      // 审核通过：所有人可见
      where.status = status;
    } else {
      // 默认（题目管理页）：仅显示审核通过的题目
      where.status = 'APPROVED';
    }
    // 编辑者不能通过 createdById 参数查看他人题目，忽略此参数
  }

  if (type) where.type = type;
  if (grade) where.grade = grade;
  if (difficulty) where.difficulty = parseInt(difficulty);
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

  // 知识标签筛选（单标签：直接按 knowledgeTagId 字段过滤）
  if (knowledgeTagIds) {
    const knowledgeTagIdArray = knowledgeTagIds.split(',');
    where.knowledgeTagId = { in: knowledgeTagIdArray };
  }

  // 有图筛选（content 中包含 Markdown 图片语法 ![](...)
  if (hasImage) {
    where.content = { contains: '![](' };
  }

  // 有解析筛选
  if (hasSolution) {
    where.solution = { not: null };
    // AND solution != '' 通过 notIn 实现
    where.AND = where.AND || [];
    (where.AND as any[]).push({ solution: { not: '' } });
  }

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        tags: { include: { tag: true } },
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
        _count: { select: { reviews: true } },
      },
      orderBy: { [safeSortBy]: safeSortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.question.count({ where }),
  ]);

  return NextResponse.json({
    questions: questions.map(q => ({ ...q, type: normalizeQuestionType(q.type) })),
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
  const { content, answer, solution, type, options, grade, difficulty, source, year, competition, tagIds, knowledgeTagId } = body;

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
      knowledgeTagId: knowledgeTagId || null,
    },
    include: { 
      tags: { include: { tag: true } },
      knowledgeTag: { include: { parent: { include: { parent: { include: { parent: { include: { parent: true } } } } } } } },
    },
  });

  return NextResponse.json(question, { status: 201 });
}
