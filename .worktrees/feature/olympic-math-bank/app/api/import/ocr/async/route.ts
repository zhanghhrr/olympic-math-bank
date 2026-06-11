import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { ImportStatus } from '@prisma/client';
import { processPDF } from '@/lib/ocr/mineru-client';
import { autoMatchKnowledgeTagsWithScores, getTagTree, type ScoredTag } from '@/lib/ocr/tagging';
import { inferGrade, estimateDifficulty } from '@/lib/ocr/import-to-db';
import { OCR_CONFIG } from '@/lib/ocr/config';
import { convertToPdf } from '@/lib/ocr/docx-converter';
import * as fs from 'fs';
import * as path from 'path';

/** 根据文件扩展名推断 MIME 类型 */
function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
  };
  return map[ext] || '';
}

/** 判断是否为图片格式 */
function isImageFormat(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
}

/** 判断是否为 DOCX/DOC 格式 */
function isDocxFormat(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ['.docx', '.doc'].includes(ext);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 });
    }

    // 获取用户 ID
    const userId = (session.user as any)?.id as string;
    if (!userId) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 验证文件格式（基于扩展名 + MIME 类型双重校验）
    const mimeType = getMimeType(file.name);
    if (!mimeType || !OCR_CONFIG.supportedFormats.includes(mimeType)) {
      // 回退：简单的扩展名检查
      const ext = path.extname(file.name).toLowerCase();
      const supportedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.doc'];
      if (!supportedExts.includes(ext)) {
        return NextResponse.json({ error: `不支持的文件格式: ${file.name}` }, { status: 400 });
      }
    }

    const outputDir = path.join(process.cwd(), 'uploads', 'ocr');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '_');
    let filePath = path.join(outputDir, `${timestamp}-${safeName}`);
    fs.writeFileSync(filePath, buffer);

    // DOCX/DOC 先转换为 PDF
    let ocrFilePath = filePath;
    if (isDocxFormat(file.name)) {
      console.log(`[Async OCR API] 检测到 DOCX 文件，尝试转换为 PDF...`);
      const pdfPath = await convertToPdf(filePath);
      if (pdfPath) {
        ocrFilePath = pdfPath;
        console.log(`[Async OCR API] DOCX → PDF 转换成功: ${ocrFilePath}`);
      } else {
        console.log(`[Async OCR API] DOCX 转换失败，尝试直接提交到 MinerU`);
      }
    }

    const job = await prisma.importJob.create({
      data: {
        type: isDocxFormat(file.name) ? 'DOCX' : isImageFormat(file.name) ? 'IMAGE' : 'PDF',
        fileUrl: filePath,
        fileName: file.name,
        status: 'PROCESSING',
        totalItems: 0,
        createdById: userId,
      },
    });

    // 将原始文件复制到 public 目录供前端预览（仅 PDF 可预览）
    let pdfUrl: string | null = null;
    const publicDir = path.join(process.cwd(), 'public', 'uploads', 'ocr');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    const publicFileName = `${timestamp}-${safeName}`;
    const publicFilePath = path.join(publicDir, publicFileName);
    if (!fs.existsSync(publicFilePath)) {
      fs.copyFileSync(filePath, publicFilePath);
    }
    // 仅 PDF 提供 iframe 预览链接
    if (!isImageFormat(file.name) && !isDocxFormat(file.name)) {
      pdfUrl = `/uploads/ocr/${publicFileName}`;
    }

    // 后台处理（使用 ocrFilePath，对 DOCX 可能是转换后的 PDF）
    processJobAsync(job.id, ocrFilePath, outputDir, file.name);

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
    if (!session) {
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
          const matchResult = await autoMatchKnowledgeTagsWithScores(q.content, q.title).catch(() => ({ bestTagId: null, scoredTags: [] as ScoredTag[] }));
          const { scoredTags } = matchResult;

          let matchedTags: Array<{ id: string; name: string; path: string; score: number; matchSource: string }> = [];
          if (scoredTags.length > 0) {
            const tagIds = scoredTags.map(s => s.tagId);
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
