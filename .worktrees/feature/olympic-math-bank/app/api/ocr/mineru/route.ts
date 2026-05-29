import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { processPDF } from '@/lib/ocr/mineru-client';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const outputDir = path.join(process.cwd(), 'uploads', 'ocr');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '_');
    const filePath = path.join(outputDir, `${timestamp}-${safeName}`);
    fs.writeFileSync(filePath, buffer);

    const result = await processPDF(filePath, outputDir);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'OCR 识别失败' }, { status: 500 });
    }

    const questions = (result.questions || []).map((q, idx) => ({
      id: `preview-${timestamp}-${idx}`,
      content: q.content || '',
      answer: q.answer || '',
      solution: q.analysis || '',
      type: q.type || 'SOLUTION',
      difficulty: q.difficulty || 3,
      status: 'DRAFT',
      grade: 'P3',
      source: file.name,
      matchedTags: [],
      formulas: q.formulas,
      sourceBlocks: q.sourceBlocks,
    }));

    return NextResponse.json({
      success: true,
      questions,
      totalPages: result.pages || 1,
      elapsed: result.elapsed,
      savedDir: result.savedDir,
    });
  } catch (error) {
    console.error('[OCR API] 错误:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'OCR 处理失败',
    }, { status: 500 });
  }
}
