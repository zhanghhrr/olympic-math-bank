/**
 * OCR导入API
 * 整合PDF OCR识别 + 题目分割 + 自动打标签
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { processPDF } from '@/lib/ocr/mineru-client';
import { smartImportFromOCR, ImportOptions } from '@/lib/ocr/import-to-db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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
    const file = formData.get('file') as File;
    const grade = (formData.get('grade') as string) || 'P3';
    const source = (formData.get('source') as string) || 'OCR导入';
    const autoMatchTags = formData.get('autoMatchTags') !== 'false'; // 默认开启

    if (!file) {
      return NextResponse.json({ error: '请选择PDF文件' }, { status: 400 });
    }

    if (!file.name.endsWith('.pdf')) {
      return NextResponse.json({ error: '只支持PDF文件' }, { status: 400 });
    }

    // 创建上传目录
    const uploadDir = join(process.cwd(), 'uploads', 'ocr');
    await mkdir(uploadDir, { recursive: true });

    // 保存文件
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = join(uploadDir, fileName);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    console.log(`[OCR Import] 开始处理PDF: ${file.name}`);

    // 1. OCR识别PDF
    const ocrResult = await processPDF(filePath, uploadDir);

    if (!ocrResult.success || !ocrResult.questions) {
      return NextResponse.json({
        error: 'OCR识别失败',
        details: ocrResult.error
      }, { status: 500 });
    }

    console.log(`[OCR Import] 识别完成，共 ${ocrResult.questions.length} 道题目`);

    // 2. 转换为OCR结果格式
    const ocrResults = ocrResult.questions.map((q, idx) => ({
      success: true as const,
      parsed: q,
      page: 1,
      questionNumber: idx + 1
    }));

    // 3. 智能导入数据库（含自动打标签）
    const importOptions: ImportOptions = {
      grade: grade as any,
      source,
      autoMatchTags
    };

    const importResult = await smartImportFromOCR(ocrResults, userId, importOptions);

    console.log(`[OCR Import] 导入完成: 成功 ${importResult.success} 道, 失败 ${importResult.failed} 道`);

    // 4. 返回结果
    return NextResponse.json({
      success: true,
      message: `OCR识别完成，成功导入 ${importResult.success} 道题目`,
      total: importResult.total,
      successCount: importResult.success,
      failedCount: importResult.failed,
      questions: importResult.questions.map(q => ({
        success: q.success,
        questionId: q.questionId,
        matchedTags: q.matchedTags,
        matchedTagDetails: q.matchedTagDetails,
        error: q.error
      }))
    });

  } catch (error) {
    console.error('[OCR Import] 导入失败:', error);
    return NextResponse.json({
      error: '导入失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}
