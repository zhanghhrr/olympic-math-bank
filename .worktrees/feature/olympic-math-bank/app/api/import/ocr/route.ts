import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { processPDF } from '@/lib/ocr/mineru-client';
import { prisma } from '@/lib/db/prisma';
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

    const source = file.name;

    // 预加载标签树缓存，避免每道题重复加载
    await getTagTree();

    const questions = await Promise.all(
      (result.questions || []).map(async (q, idx) => {
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

        // 从 sourceBlocks 提取题目所在页码
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
          } catch { /* ignore parse error */ }
        }

        const compoundContent = [q.content, q.answer, q.analysis].filter(Boolean).join(' ');
        const grade = inferGrade(compoundContent, source);
        const difficulty = estimateDifficulty(compoundContent, grade);

        return {
          id: `preview-${timestamp}-${idx}`,
          content: q.content || '',
          answer: q.answer || '',
          solution: q.analysis || '',
          type: q.type || 'SOLUTION',
          difficulty,
          status: 'DRAFT',
          grade,
          source,
          matchedTags,
          formulas: q.formulas,
          sourceBlocks: q.sourceBlocks,
          pages,
        };
      }),
    );

    // 将上传的 PDF 复制到 public 目录，供前端 iframe 预览
    const publicDir = path.join(process.cwd(), 'public', 'uploads', 'ocr');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    const publicFileName = `${timestamp}-${safeName}`;
    const publicFilePath = path.join(publicDir, publicFileName);
    if (!fs.existsSync(publicFilePath)) {
      fs.copyFileSync(filePath, publicFilePath);
    }
    const pdfUrl = `/uploads/ocr/${publicFileName}`;

    return NextResponse.json({
      success: true,
      questions,
      totalPages: result.pages || 1,
      elapsed: result.elapsed,
      savedDir: result.savedDir,
      pdfUrl,
    });
  } catch (error) {
    console.error('[Import OCR API] 错误:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'OCR 处理失败',
    }, { status: 500 });
  }
}
