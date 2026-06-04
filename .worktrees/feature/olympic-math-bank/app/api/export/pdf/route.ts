import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { ExamDocument } from '@/lib/pdf/document';
import { resolveImageToBase64 } from '@/lib/pdf/image-resolver';
import { parseContentToSegments, formulaToSvgDataUri } from '@/lib/pdf/render-katex';
import path from 'path';

interface ClientBlock {
  id: string;
  type: 'MAIN_TITLE' | 'SUB_TITLE' | 'QUESTION' | 'PAGE_BREAK';
  content?: string;
  question?: {
    id: string;
    content: string;
    answer?: string;
    solution?: string;
    type: string;
  };
}

function resolveSegments(segments: { type: string; content: string; src?: string; dataUri?: string }[]) {
  for (const seg of segments) {
    if (seg.type === 'image' && seg.src) {
      const filename = path.basename(seg.src);
      const base64 = resolveImageToBase64(filename);
      if (base64) {
        seg.dataUri = base64;
      }
    } else if (seg.type === 'inline-formula' || seg.type === 'block-formula') {
      const displayMode = seg.type === 'block-formula';
      const result = formulaToSvgDataUri(seg.content, displayMode);
      seg.dataUri = result.dataUri;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blocks, mode } = body as {
      blocks: ClientBlock[];
      mode: 'student' | 'teacher';
    };

    if (!blocks || !Array.isArray(blocks)) {
      return NextResponse.json(
        { error: 'blocks 参数无效' },
        { status: 400 },
      );
    }

    const processedBlocks = blocks.map((block) => {
      if (block.type === 'QUESTION' && block.question) {
        const segments = parseContentToSegments(block.question.content);
        resolveSegments(segments);
        return { ...block, segments };
      }
      return block;
    });

    const buffer = await renderToBuffer(
      ExamDocument({ blocks: processedBlocks as any, mode: mode || 'student' }) as any,
    );

    const pdfData = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : new Uint8Array(buffer as any);

    return new NextResponse(pdfData, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="exam.pdf"',
        'Content-Length': String(pdfData.length),
      },
    });
  } catch (error) {
    console.error('PDF 生成失败:', error);
    return NextResponse.json(
      { error: 'PDF 生成失败' },
      { status: 500 },
    );
  }
}
