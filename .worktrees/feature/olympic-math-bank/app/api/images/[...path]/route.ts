import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import path from 'path';
import fs from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // OCR 导入图片需要登录后访问
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const { path: pathParts } = await params;

  if (pathParts.length === 0) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), 'uploads', 'ocr');

  let filePath: string | null = null;

  // 新格式: /api/images/<baseName>/<filename> — OCR 导入时将目录前缀写入路径
  // 直接定位: uploads/ocr/<baseName>/images/<filename>
  if (pathParts.length >= 2) {
    const baseName = pathParts[0];
    const filename = pathParts[pathParts.length - 1];
    const directPath = path.join(uploadsDir, baseName, 'images', filename);
    if (fs.existsSync(directPath)) {
      filePath = directPath;
    }
  }

  // 旧格式（向后兼容）: /api/images/<filename> — 递归按文件名搜索
  if (!filePath) {
    const filename = pathParts[pathParts.length - 1];
    filePath = findFileRecursive(uploadsDir, filename);
  }

  if (!filePath) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  // 读取文件
  const fileBuffer = fs.readFileSync(filePath);

  // 获取 MIME 类型
  const filename = pathParts[pathParts.length - 1];
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

/** 递归按文件名搜索（旧格式兼容，避免破坏已有引用） */
function findFileRecursive(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'images') {
        const files = fs.readdirSync(fullPath);
        if (files.includes(filename)) {
          return path.join(fullPath, filename);
        }
      }
      const found = findFileRecursive(fullPath, filename);
      if (found) return found;
    }
  }
  return null;
}
