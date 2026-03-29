import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

// 更新标签
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, type, description, order } = body;

    // 检查标签是否存在
    const existingTag = await prisma.tag.findUnique({
      where: { id },
    });

    if (!existingTag) {
      return NextResponse.json(
        { error: '标签不存在' },
        { status: 404 }
      );
    }

    // 如果修改了名称，检查是否与其他标签冲突
    if (name && name !== existingTag.name) {
      const duplicate = await prisma.tag.findUnique({
        where: { name },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: '标签名称已存在' },
          { status: 409 }
        );
      }
    }

    const updatedTag = await prisma.tag.update({
      where: { id },
      data: {
        name: name || existingTag.name,
        type: type || existingTag.type,
        description: description !== undefined ? description : existingTag.description,
        order: order !== undefined ? order : existingTag.order,
      },
    });

    return NextResponse.json(updatedTag);
  } catch (error) {
    console.error('Failed to update tag:', error);
    return NextResponse.json(
      { error: '更新标签失败' },
      { status: 500 }
    );
  }
}

// 删除标签
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // 检查标签是否存在
    const existingTag = await prisma.tag.findUnique({
      where: { id },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });

    if (!existingTag) {
      return NextResponse.json(
        { error: '标签不存在' },
        { status: 404 }
      );
    }

    // 检查是否有题目使用此标签
    if (existingTag._count.questions > 0) {
      return NextResponse.json(
        { error: `该标签已被 ${existingTag._count.questions} 道题目使用，无法删除` },
        { status: 400 }
      );
    }

    await prisma.tag.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete tag:', error);
    return NextResponse.json(
      { error: '删除标签失败' },
      { status: 500 }
    );
  }
}
