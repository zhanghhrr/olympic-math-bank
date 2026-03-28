import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { mkdir } from 'fs/promises';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  // 获取或创建用户
  let userId: string;

  const sessionUserId = (session?.user as any)?.id;
  if (sessionUserId) {
    userId = sessionUserId as string;
  } else {
    // 开发环境：查找或创建默认用户
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

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const type = formData.get('type') as string;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    // Create upload directory
    const uploadDir = join(process.cwd(), 'uploads', 'imports');
    await mkdir(uploadDir, { recursive: true });

    // Create import job
    const job = await prisma.importJob.create({
      data: {
        type: type.toUpperCase(),
        fileUrl: '',
        fileName: files.map(f => f.name).join(', '),
        status: 'PROCESSING',
        totalItems: files.length,
        createdById: userId,
      },
    });

    // Save files and create import items
    const savedFiles = [];
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = join(uploadDir, fileName);
      
      await writeFile(filePath, buffer);
      savedFiles.push(filePath);

      // Create import job item
      await prisma.importJobItem.create({
        data: {
          jobId: job.id,
          imageUrl: filePath,
          status: 'PENDING',
        },
      });
    }

    // Update job with file URL
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        fileUrl: savedFiles[0],
        status: 'PENDING',
      },
    });

    return NextResponse.json({ 
      success: true, 
      jobId: job.id,
      message: 'Files uploaded successfully, waiting for OCR processing' 
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
