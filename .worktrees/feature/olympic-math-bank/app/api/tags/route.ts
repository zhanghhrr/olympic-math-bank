import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

// 获取所有标签
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tags = await prisma.tag.findMany({
      orderBy: [{ type: 'asc' }, { order: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });

    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Failed to fetch tags:', error);
    return NextResponse.json(
      { error: '获取标签失败' },
      { status: 500 }
    );
  }
}

// 创建新标签
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, description, order = 0 } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: '标签名称和类型不能为空' },
        { status: 400 }
      );
    }

    // 检查是否已存在
    const existing = await prisma.tag.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { error: '标签名称已存在' },
        { status: 409 }
      );
    }

    const tag = await prisma.tag.create({
      data: {
        name,
        type,
        description,
        order,
      },
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error('Failed to create tag:', error);
    return NextResponse.json(
      { error: '创建标签失败' },
      { status: 500 }
    );
  }
}
