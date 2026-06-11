/**
 * DOCX/DOC → PDF 转换器
 *
 * 策略：
 *   1. 优先使用 LibreOffice headless 转换（最可靠，保留公式排版）
 *   2. 如果 LibreOffice 不可用，返回 null 让调用方尝试直接提交 DOCX 到 MinerU
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * 检查 LibreOffice 是否可用
 */
function isLibreOfficeAvailable(): boolean {
  try {
    if (process.platform === 'win32') {
      // 检查常见安装路径
      const paths = [
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return true;
      }
      // 尝试直接执行
      try {
        execSync('where soffice', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    } else {
      execSync('which soffice', { stdio: 'ignore' });
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * 获取 LibreOffice 可执行文件路径
 */
function getLibreOfficePath(): string {
  if (process.platform === 'win32') {
    const paths = [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return 'soffice';
}

/**
 * 将 DOCX/DOC 文件转换为 PDF
 *
 * @param inputPath 输入的 .docx 或 .doc 文件路径
 * @returns 转换后的 PDF 文件路径，失败返回 null
 */
export async function convertToPdf(inputPath: string): Promise<string | null> {
  if (!isLibreOfficeAvailable()) {
    console.log('[DOCX Converter] LibreOffice 不可用，跳过转换');
    return null;
  }

  const inputDir = path.dirname(inputPath);
  const sofficePath = getLibreOfficePath();

  try {
    console.log(`[DOCX Converter] 使用 LibreOffice 转换: ${inputPath}`);
    execSync(
      `"${sofficePath}" --headless --convert-to pdf --outdir "${inputDir}" "${inputPath}"`,
      { timeout: 120000, stdio: 'pipe' },
    );

    // LibreOffice 输出文件名为 原文件名(无ext).pdf
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const pdfPath = path.join(inputDir, `${baseName}.pdf`);

    if (fs.existsSync(pdfPath)) {
      console.log(`[DOCX Converter] 转换成功: ${pdfPath}`);
      return pdfPath;
    }

    console.error(`[DOCX Converter] 转换后未找到 PDF: ${pdfPath}`);
    return null;
  } catch (error) {
    console.error(
      `[DOCX Converter] 转换失败:`,
      error instanceof Error ? error.message : '未知错误',
    );
    return null;
  }
}
