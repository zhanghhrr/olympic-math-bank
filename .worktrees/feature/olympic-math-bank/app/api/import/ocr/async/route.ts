import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { ImportStatus } from '@prisma/client';
import { processPDF } from '@/lib/ocr/mineru-client';
import { autoMatchKnowledgeTagsWithScores, getTagTree, type ScoredTag } from '@/lib/ocr/tagging';
import { inferGrade, estimateDifficulty } from '@/lib/ocr/import-to-db';
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

    // 获取用户 ID
    const sessionUserId = (session.user as any)?.id as string | undefined;
    let userId = sessionUserId;
    if (!userId) {
      const defaultUser = await prisma.user.findFirst({
        where: { email: session.user.email },
      });
      userId = defaultUser?.id;
      if (!userId) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 验证文件为合法的 PDF（magic bytes: %PDF-）
    const pdfMagic = buffer.slice(0, 5).toString('ascii');
    if (pdfMagic !== '%PDF-') {
      return NextResponse.json({ error: '上传的文件不是有效的 PDF 格式' }, { status: 400 });
    }

    const outputDir = path.join(process.cwd(), 'uploads', 'ocr');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '_');
    const filePath = path.join(outputDir, `${timestamp}-${safeName}`);
    fs.writeFileSync(filePath, buffer);

    const job = await prisma.importJob.create({
      data: {
        type: 'PDF',
        fileUrl: filePath,
        fileName: file.name,
        status: 'PROCESSING',
        totalItems: 0,
        createdById: userId,
      },
    });

    // 将 PDF 复制到 public 目录供前端预览
    const publicDir = path.join(process.cwd(), 'public', 'uploads', 'ocr');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    const publicFileName = `${timestamp}-${safeName}`;
    const publicFilePath = path.join(publicDir, publicFileName);
    if (!fs.existsSync(publicFilePath)) {
      fs.copyFileSync(filePath, publicFilePath);
    }
    const pdfUrl = `/uploads/ocr/${publicFileName}`;

    // 后台处理
    processJobAsync(job.id, filePath, outputDir, file.name);

    return NextResponse.json({
      jobId: job.id,
      pdfUrl,
    });
  } catch (error) {
    console.error('[Async OCR API] 错误:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '创建任务失败',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: '缺少 jobId' }, { status: 400 });
    }

    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      include: { items: true },
    });

    if (!job) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    // 如果任务完成，返回题目预览数据
    if (job.status === 'COMPLETED') {
      const questions = job.items.map((item, idx) => {
        const parsed = item.parsedData ? JSON.parse(item.parsedData) : {};
        return {
          id: item.id,
          content: parsed.content || item.ocrResult || '',
          answer: parsed.answer || '',
          solution: parsed.analysis || '',
          type: parsed.type || 'SOLUTION',
          difficulty: parsed.difficulty || 3,
          status: 'DRAFT',
          grade: parsed.grade || 'P3',
          source: job.fileName,
          matchedTags: parsed.matchedTags || [],
          formulas: parsed.formulas,
          sourceBlocks: parsed.sourceBlocks,
          pages: parsed.pages || [],
        };
      });

      return NextResponse.json({
        status: job.status,
        questions,
        totalPages: job.totalItems,
      });
    }

    return NextResponse.json({
      status: job.status,
      processedItems: job.processedItems,
      totalItems: job.totalItems,
      errorMessage: job.errorMessage,
    });
  } catch (error) {
    console.error('[Async OCR Status] 错误:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '查询失败',
    }, { status: 500 });
  }
}

async function processJobAsync(
  jobId: string,
  filePath: string,
  outputDir: string,
  source: string,
) {
  // 整体超时保护：5 分钟
  const PROCESS_TIMEOUT_MS = 5 * 60 * 1000;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('处理超时（5分钟）')), PROCESS_TIMEOUT_MS);
  });

  const doProcess = async () => {
    try {
    // 阶段 1：OCR 识别
    console.log(`[Async OCR Job ${jobId}] 开始 OCR 识别...`);
    const result = await processPDF(filePath, outputDir);

    if (!result.success) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: result.error || 'OCR 识别失败' },
      });
      return;
    }

    const questions = result.questions || [];
    // OCR 完成后立即更新 totalItems，前端可据此展示真实题目数量
    await prisma.importJob.update({
      where: { id: jobId },
      data: { totalItems: questions.length },
    });
    console.log(`[Async OCR Job ${jobId}] OCR 完成，共识别 ${questions.length} 道题目，开始标签匹配...`);

    // 预热标签树（失败不阻断流程）
    await getTagTree().catch(err => {
      console.warn(`[Async OCR Job ${jobId}] getTagTree 失败，标签匹配可能受影响:`, err);
    });

    const parsedItems: Array<{
      jobId: string;
      ocrResult: string;
      parsedData: string;
    }> = [];

    // 简单的并发限制器：最多 3 个并发 LLM 打标签请求
    const CONCURRENCY = 3;
    
    for (let i = 0; i < questions.length; i += CONCURRENCY) {
      const batch = questions.slice(i, i + CONCURRENCY);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (q) => {
          const matchResult = await autoMatchKnowledgeTagsWithScores(q.content, q.title).catch(() => ({ tagIds: [], scoredTags: [] as ScoredTag[] }));
          const { tagIds, scoredTags } = matchResult;

          let matchedTags: Array<{ id: string; name: string; path: string; score: number; matchSource: string }> = [];
          if (tagIds.length > 0) {
            const tags = await prisma.knowledgeTag.findMany({
              where: { id: { in: tagIds } },
              select: { id: true, name: true, module: true, topic: true, subtopic: true, knowledge: true, skill: true },
              take: 5,
            });
            const scoreMap = new Map(scoredTags.map(s => [s.tagId, { score: s.score, matchSource: s.matchSource }]));
            matchedTags = tags.map(t => {
              const scoreInfo = scoreMap.get(t.id);
              return {
                id: t.id,
                name: t.name,
                path: [t.module, t.topic, t.subtopic, t.knowledge, t.skill].filter(Boolean).join(' > '),
                score: scoreInfo?.score ?? 0,
                matchSource: scoreInfo?.matchSource ?? 'keyword',
              };
            });
          }

          let pages: number[] = [];
          if (q.sourceBlocks) {
            try {
              const blocks = JSON.parse(q.sourceBlocks) as Array<{ pageIdx: number }>;
              const pageSet = new Set<number>();
              for (const b of blocks) {
                if (typeof b.pageIdx === 'number' && b.pageIdx >= 0) {
                  pageSet.add(b.pageIdx);
                }
              }
              pages = Array.from(pageSet).sort((a, b) => a - b);
            } catch { /* ignore */ }
          }

          const compoundContent = [q.content, q.answer, q.analysis].filter(Boolean).join(' ');
          const grade = inferGrade(compoundContent, source);
          const difficulty = estimateDifficulty(compoundContent, grade);

          parsedItems.push({
            jobId,
            ocrResult: q.content || '',
            parsedData: JSON.stringify({
              content: q.content,
              answer: q.answer,
              analysis: q.analysis,
              type: q.type || 'SOLUTION',
              difficulty,
              grade,
              matchedTags,
              formulas: q.formulas,
              sourceBlocks: q.sourceBlocks,
              pages,
            }),
          });
        })
      );

      // 记录失败的批次项
       for (let j = 0; j < batchResults.length; j++) {
         if (batchResults[j].status === 'rejected') {
           console.error(`[Async OCR Job ${jobId}] 第 ${i + j + 1} 题处理失败:`, (batchResults[j] as PromiseRejectedResult).reason);
         }
       }

      // 每完成一批，增量更新已处理数量，供前端实时展示进度
      const currentProcessed = Math.min(i + CONCURRENCY, questions.length);
      await prisma.importJob.update({
        where: { id: jobId },
        data: { processedItems: currentProcessed },
      }).catch(err => {
        console.warn(`[Async OCR Job ${jobId}] 更新进度失败:`, err);
      });
    }

    await prisma.$transaction([
      prisma.importJobItem.createMany({
        data: parsedItems.map(item => ({
          jobId: item.jobId,
          imageUrl: '',
          ocrResult: item.ocrResult,
          parsedData: item.parsedData,
          status: 'COMPLETED' as ImportStatus,
        })),
      }),
      prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          totalItems: parsedItems.length,
          processedItems: parsedItems.length,
        },
      }),
    ]);
  } catch (error) {
    console.error(`[Async OCR Job ${jobId}] 失败:`, error);
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : '处理失败',
      },
    }).catch(() => {});
  }
  };

  try {
    await Promise.race([doProcess(), timeoutPromise]);
  } catch (error) {
    console.error(`[Async OCR Job ${jobId}] 失败:`, error);
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : '处理失败',
      },
    }).catch(() => {});
  }
}
