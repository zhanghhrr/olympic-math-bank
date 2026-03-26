import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tags = await prisma.tag.findMany({
    orderBy: [{ type: 'asc' }, { order: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({ tags });
}
