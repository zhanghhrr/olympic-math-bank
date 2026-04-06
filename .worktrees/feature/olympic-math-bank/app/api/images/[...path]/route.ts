import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;
  const filename = pathParts[pathParts.length - 1];

  // 搜索 uploads/ocr 下所有包含此文件的目录
  const uploadsDir = path.join(process.cwd(), 'uploads', 'ocr');

  function findFile(dir: string, filename: string): string | null {
    if (!fs.existsSync(dir)) return null;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 如果是 images 子目录，在其中查找文件
        if (entry.name === 'images') {
          const imagesDir = fullPath;
          const files = fs.readdirSync(imagesDir);
          if (files.includes(filename)) {
            return path.join(imagesDir, filename);
          }
        }
        // 递归搜索子目录
        const found = findFile(fullPath, filename);
        if (found) return found;
      }
    }
    return null;
  }

  const filePath = findFile(uploadsDir, filename);

  if (!filePath) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  // 读取文件
  const fileBuffer = fs.readFileSync(filePath);

  // 获取 MIME 类型
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
