/**
 * OCR预览API
 * 整合PDF OCR识别 + 题目分割
 * 只返回预览列表，不写入数据库
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { processPDF } from '@/lib/ocr/mineru-client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const grade = (formData.get('grade') as string) || 'P3';
    const source = (formData.get('source') as string) || 'OCR导入';
    const autoMatchTags = formData.get('autoMatchTags') !== 'false';

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

    console.log(`[OCR Preview] 开始处理PDF: ${file.name}`);

    // 1. OCR识别PDF
    const ocrResult = await processPDF(filePath, uploadDir);

    if (!ocrResult.success || !ocrResult.questions) {
      return NextResponse.json({
        error: 'OCR识别失败',
        details: ocrResult.error
      }, { status: 500 });
    }

    console.log(`[OCR Preview] 识别完成，共 ${ocrResult.questions.length} 道题目`);

    // 2. 直接返回OCR结果作为预览（不写入数据库）
    return NextResponse.json({
      success: true,
      message: `OCR识别完成，共 ${ocrResult.questions.length} 道题目待确认`,
      total: ocrResult.questions.length,
      questions: ocrResult.questions.map((q, idx) => ({
        // 使用临时ID，前端编辑时使用
        id: `preview-${Date.now()}-${idx}`,
        content: q.content || '',
        answer: q.answer || '',
        solution: q.analysis || '',
        type: q.type || 'SOLUTION',
        difficulty: q.difficulty || 3,
        status: 'DRAFT',
        grade: grade,
        source: source,
        matchedTags: [],
      })),
    });

  } catch (error) {
    console.error('[OCR Preview] 处理失败:', error);
    return NextResponse.json({
      error: '处理失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}
