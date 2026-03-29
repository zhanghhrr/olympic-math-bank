/**
 * MinerU OCR API 路由
 * 处理PDF上传和OCR识别
 * 使用 HybridQuestionIdentifier 进行智能题目识别
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { HybridQuestionIdentifier, ParsedQuestion } from '@/lib/ocr/question-identifier';

const execAsync = promisify(exec);

// MinerU Web API 配置
const MINERU_API_URL = process.env.MINERU_API_URL || 'http://localhost:8000';

interface MinerUResponse {
  success: boolean;
  markdown?: string;
  content?: string;
  error?: string;
  images?: string[];
}

// 创建识别器实例
const questionIdentifier = new HybridQuestionIdentifier();

/**
 * POST /api/ocr/mineru
 * 上传PDF并进行OCR识别
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const grade = formData.get('grade') as string;
    const source = formData.get('source') as string;
    const autoSplit = formData.get('autoSplit') === 'true';

    if (!file) {
      return NextResponse.json(
        { success: false, error: '未找到上传的文件' },
        { status: 400 }
      );
    }

    // 创建临时目录
    const tempDir = join(tmpdir(), 'mineru-ocr', randomUUID());
    await mkdir(tempDir, { recursive: true });

    // 保存上传的文件
    const pdfPath = join(tempDir, file.name);
    const bytes = await file.arrayBuffer();
    await writeFile(pdfPath, Buffer.from(bytes));

    console.log(`[MinerU OCR] 开始处理文件: ${file.name}`);

    // 调用 MinerU API 进行识别
    const mineruResult = await callMinerUApi(pdfPath);

    if (!mineruResult.success) {
      return NextResponse.json(
        { success: false, error: mineruResult.error || 'OCR识别失败' },
        { status: 500 }
      );
    }

    // 解析识别结果
    const markdownContent = mineruResult.markdown || mineruResult.content || '';
    
    // 使用新的 HybridQuestionIdentifier 进行智能分割
    let parsedList: ParsedQuestion[] = [];
    
    if (autoSplit) {
      console.log('[MinerU OCR] 使用智能分割模式...');
      const blocks = questionIdentifier.splitContent(markdownContent);
      console.log(`[MinerU OCR] 识别到 ${blocks.length} 个文本块`);
      parsedList = questionIdentifier.convertToQuestions(blocks);
    } else {
      // 不自动分割，整体作为一个题目
      parsedList = [{
        content: markdownContent,
        hasImage: questionIdentifier.hasImage(markdownContent)
      }];
    }

    console.log(`[MinerU OCR] 提取到 ${parsedList.length} 道题目`);

    // 导入到数据库
    let importResult = null;
    try {
      const { smartImportFromOCR } = await import('@/lib/ocr/import-to-db');
      const { getServerSession } = await import('next-auth');
      const { authOptions } = await import('@/lib/auth');

      const session = await getServerSession(authOptions);
      const userId = (session?.user as any)?.id;
      if (userId) {
        const ocrResults = parsedList.map((parsed, index) => ({
          success: true,
          parsed,
          questionNumber: index + 1,
        }));

        importResult = await smartImportFromOCR(
          ocrResults,
          userId,
          {
            grade: grade as any,
            source: source || 'MinerU OCR导入',
            autoMatchTags: true,
          }
        );
      }
    } catch (importError) {
      console.error('[MinerU OCR] 导入数据库失败:', importError);
    }

    // 清理临时文件
    try {
      await execAsync(`rm -rf "${tempDir}"`);
    } catch {
      // 忽略清理错误
    }

    return NextResponse.json({
      success: true,
      markdownContent,
      parsedList,
      parsed: parsedList[0],
      importResult: importResult
        ? {
            success: importResult.failed === 0,
            importedCount: importResult.success,
            errors: importResult.questions
              .filter((q) => !q.success)
              .map((q) => q.error || '未知错误'),
            questions: importResult.questions
              .filter((q) => q.success)
              .map((q) => ({
                id: q.questionId!,
                title: parsedList[importResult.questions.indexOf(q)]?.title || '未命名题目',
                content:
                  parsedList[importResult.questions.indexOf(q)]?.content?.slice(0, 100) +
                    '...' || '',
              })),
          }
        : null,
    });
  } catch (error) {
    console.error('[MinerU OCR] 处理失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '处理失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 调用 MinerU API
 */
async function callMinerUApi(pdfPath: string): Promise<MinerUResponse> {
  try {
    // 方法1: 尝试调用本地 MinerU Web 服务
    const formData = new FormData();
    const fileBuffer = await readFile(pdfPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('file', blob, 'input.pdf');

    const response = await fetch(`${MINERU_API_URL}/pdf/parse`, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        markdown: result.markdown || result.content,
        images: result.images,
      };
    }

    // 如果本地API调用失败，返回错误
    const errorText = await response.text();
    throw new Error(`MinerU API调用失败: ${response.status} ${errorText}`);
  } catch (apiError) {
    console.error('[MinerU OCR] API调用失败:', apiError);
    throw apiError;
  }
}
