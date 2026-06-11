/**
 * Puppeteer PDF 渲染器 — 仿教研云方案：无头 Chromium 渲染 HTML → PDF。
 *
 * 在 Docker 容器中运行时需要：
 * - Chromium 系统库（已在 Dockerfile 中安装）
 * - --no-sandbox 启动参数
 * - 足够内存（建议 ≥ 512MB 可用）
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';

// ============================================================
// 配置
// ============================================================

/** PDF 导出目录（相对于项目根目录） */
const EXPORT_DIR = path.resolve(process.cwd(), 'exports', 'pdf');

/** 确保导出目录存在 */
function ensureExportDir(): void {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

/** Puppeteer 启动参数 — Docker 环境兼容 */
function getLaunchArgs(): string[] {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--font-render-hinting=none',
  ];
  return args;
}

// ============================================================
// 核心渲染函数
// ============================================================

export interface RenderPdfOptions {
  html: string;
  outputPath?: string; // 如果不指定则只返回 Buffer
}

/**
 * 将 HTML 字符串渲染为 PDF 并写入磁盘。
 * 返回 { buffer, filePath, fileSize }。
 */
export async function renderHtmlToPdf(options: RenderPdfOptions): Promise<{
  buffer: Buffer;
  filePath?: string;
  fileSize: number;
}> {
  const { html, outputPath } = options;

  ensureExportDir();

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: getLaunchArgs(),
    });

    const page = await browser.newPage();

    // 设置页面内容
    // Puppeteer v25 类型定义中移除了 networkidle0，但运行时仍支持
    await page.setContent(html, {
      waitUntil: 'networkidle0' as any,
      timeout: 30000,
    });

    // 等待字体加载完成
    await page.evaluate(() => document.fonts.ready);

    // 额外等待 500ms 确保渲染稳定
    await new Promise((r) => setTimeout(r, 500));

    // 生成 PDF，页边距由 CSS @page 规则控制（15mm 四边）
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });

    const buffer = Buffer.from(pdfBuffer);

    // 写入磁盘
    let filePath: string | undefined;
    if (outputPath) {
      const fullPath = path.isAbsolute(outputPath)
        ? outputPath
        : path.join(EXPORT_DIR, outputPath);
      fs.writeFileSync(fullPath, buffer);
      filePath = fullPath;
    }

    return {
      buffer,
      filePath,
      fileSize: buffer.length,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 生成 PDF 文件名。
 * 格式：exam_{YYYYMMDD}_{HHmmss}_{random}.pdf
 */
export function generatePdfFileName(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  return `exam_${dateStr}_${timeStr}_${random}.pdf`;
}

/** 获取导出目录的绝对路径 */
export function getExportDir(): string {
  ensureExportDir();
  return EXPORT_DIR;
}
