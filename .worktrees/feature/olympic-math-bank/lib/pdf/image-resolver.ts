import path from 'path';
import fs from 'fs';

export function resolveImageToBase64(filename: string): string | null {
  const uploadsDir = path.join(process.cwd(), 'uploads', 'ocr');

  function findFile(dir: string, filename: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'images') {
          const files = fs.readdirSync(fullPath);
          if (files.includes(filename)) return path.join(fullPath, filename);
        }
        const found = findFile(fullPath, filename);
        if (found) return found;
      }
    }
    return null;
  }

  const filePath = findFile(uploadsDir, filename);
  if (!filePath) return null;

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const mime = mimeTypes[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}
