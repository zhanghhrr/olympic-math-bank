/**
 * MinerU OCR 客户端
 * 使用 HybridQuestionIdentifier 进行智能题目识别
 *
 * 注：原始的 Python 实现已备份到 scripts/web_pdf_converter.py
 * 此 TypeScript 版本是基于 Python 实现的移植
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { HybridQuestionIdentifier, type ParsedQuestion } from './question-identifier';

const MINERU_BASE_URL = 'https://opendatalab-mineru.ms.show';

// 创建识别器实例
const questionIdentifier = new HybridQuestionIdentifier();

export interface MinerUResult {
  success: boolean;
  markdownContent?: string;
  questions?: ParsedQuestion[];
  error?: string;
}

// 重新导出 ParsedQuestion 类型
export { ParsedQuestion };

/**
 * 生成随机session hash
 */
function generateSessionHash(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 上传PDF文件到MinerU
 */
async function uploadPDF(filePath: string): Promise<string | null> {
  try {
    console.log('  [MinerU] 上传文件...');
    
    const formData = new FormData();
    formData.append('files', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: 'application/pdf',
    });
    
    const uploadUrl = `${MINERU_BASE_URL}/gradio_api/upload`;
    
    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://opendatalab-mineru.ms.show/',
        'Origin': 'https://opendatalab-mineru.ms.show',
      },
      timeout: 60000,
    });
    
    if (response.status === 200) {
      const data = response.data;
      if (Array.isArray(data) && data.length > 0) {
        console.log('  [MinerU] 上传成功');
        return data[0];
      } else if (data && data.path) {
        console.log('  [MinerU] 上传成功');
        return data.path;
      }
    }
    
    console.error('  [MinerU] 上传响应格式错误:', response.data);
    return null;
  } catch (error) {
    console.error('  [MinerU] 上传失败:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}

/**
 * 调用MinerU预测接口
 */
async function predictPDF(serverFilePath: string, fileName: string, fileSize: number): Promise<any> {
  try {
    console.log('  [MinerU] 开始识别...');
    
    const sessionHash = generateSessionHash();
    
    // 构造文件参数
    const fileArg = {
      path: serverFilePath,
      url: `${MINERU_BASE_URL}/file=${serverFilePath}`,
      orig_name: fileName,
      size: fileSize,
      mime_type: 'application/pdf',
      meta: { _type: 'gradio.FileData' }
    };
    
    // 构造payload (fn_index=8)
    const payload = {
      data: [
        fileArg,                                      // ID 5: File
        20,                                           // ID 8: Max pages
        false,                                        // ID 24: Force OCR
        true,                                         // ID 20: Formula Hybrid
        true,                                         // ID 19: Table Enable
        'ch (Chinese, English, Chinese Traditional)', // ID 23: OCR Language
        'vlm-auto-engine',                            // ID 11: Backend
        'http://localhost:30000'                      // ID 14: Server URL
      ],
      event_data: null,
      fn_index: 8,
      session_hash: sessionHash
    };
    
    const joinParams = {
      t: Date.now().toString(),
      __theme: 'dark',
      backend_url: '/'
    };
    
    const predictUrl = `${MINERU_BASE_URL}/gradio_api/queue/join`;
    
    const response = await axios.post(predictUrl, payload, {
      params: joinParams,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://opendatalab-mineru.ms.show/',
      },
      timeout: 120000,
    });
    
    if (response.status === 200) {
      const result = response.data;
      const eventId = result.event_id;
      
      if (eventId) {
        console.log(`  [MinerU] 任务已提交 (Event ID: ${eventId})`);
        // 等待结果
        return await waitForResult(sessionHash, eventId);
      }
    }
    
    console.error('  [MinerU] 预测失败:', response.status);
    return null;
  } catch (error) {
    console.error('  [MinerU] 预测失败:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}

/**
 * 等待MinerU处理结果
 */
async function waitForResult(sessionHash: string, eventId: string): Promise<any> {
  const dataUrl = `${MINERU_BASE_URL}/gradio_api/queue/data`;
  const maxAttempts = 60; // 最多等待60秒
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(dataUrl, {
        params: {
          session_hash: sessionHash,
          studio_token: ''
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 30000,
        responseType: 'text',
      });
      
      const lines = response.data.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const msg = JSON.parse(line.substring(6));
            
            if (msg.msg === 'process_completed') {
              return msg;
            } else if (msg.msg === 'process_failed') {
              console.error('  [MinerU] 处理失败:', msg);
              return null;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
      
      // 等待1秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`  [MinerU] 获取结果失败 (尝试 ${attempt + 1}/${maxAttempts}):`, 
        error instanceof Error ? error.message : '未知错误');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.error('  [MinerU] 等待结果超时');
  return null;
}

/**
 * 从MinerU结果中提取zip文件URL
 */
function extractZipUrl(result: any): string | null {
  if (!result || !result.output || !result.output.data) {
    return null;
  }
  
  const dataList = result.output.data;
  
  for (const item of dataList) {
    if (typeof item === 'object') {
      // 检查是否是文件更新指令
      if (item.__type__ === 'update' && item.value) {
        const value = Array.isArray(item.value) ? item.value[0] : item.value;
        if (value && (value.orig_name?.endsWith('.zip') || value.path?.endsWith('.zip'))) {
          return value.url || `${MINERU_BASE_URL}/file=${value.path}`;
        }
      }
      // 旧格式兼容
      if (item.path && (item.orig_name?.endsWith('.zip') || item.path?.endsWith('.zip'))) {
        return item.url || `${MINERU_BASE_URL}/file=${item.path}`;
      }
    }
  }
  
  return null;
}

/**
 * 下载并解压结果
 */
async function downloadResult(zipUrl: string, outputDir: string, fileName: string): Promise<string | null> {
  try {
    console.log('  [MinerU] 下载结果...');
    
    const response = await axios.get(zipUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    
    if (response.status === 200) {
      // 保存zip文件
      const zipPath = path.join(outputDir, `${fileName}.zip`);
      fs.writeFileSync(zipPath, response.data);
      
      // 解压
      const extractDir = path.join(outputDir, fileName);
      if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
      }
      
      // 使用系统unzip命令解压
      const { execSync } = require('child_process');
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'ignore' });
      
      // 删除zip文件
      fs.unlinkSync(zipPath);
      
      console.log('  [MinerU] 下载完成');
      return extractDir;
    }
    
    return null;
  } catch (error) {
    console.error('  [MinerU] 下载失败:', error instanceof Error ? error.message : '未知错误');
    return null;
  }
}

/**
 * 从解压后的目录读取markdown内容
 */
function readMarkdownContent(extractDir: string): string {
  try {
    // 查找markdown文件
    const files = fs.readdirSync(extractDir);
    const mdFile = files.find(f => f.endsWith('.md'));
    
    if (mdFile) {
      return fs.readFileSync(path.join(extractDir, mdFile), 'utf-8');
    }
    
    // 如果没有md文件，查找txt文件
    const txtFile = files.find(f => f.endsWith('.txt'));
    if (txtFile) {
      return fs.readFileSync(path.join(extractDir, txtFile), 'utf-8');
    }
    
    return '';
  } catch (error) {
    console.error('  [MinerU] 读取结果失败:', error);
    return '';
  }
}

/**
 * 从markdown内容提取题目
 * 使用 HybridQuestionIdentifier 进行智能识别
 */
function extractQuestionsFromMarkdown(markdown: string): ParsedQuestion[] {
  console.log('[MinerU Client] 使用智能分割模式识别题目...');
  
  // 使用 HybridQuestionIdentifier 进行智能分割
  const blocks = questionIdentifier.splitContent(markdown);
  console.log(`[MinerU Client] 识别到 ${blocks.length} 个文本块`);
  
  // 转换为标准题目格式
  const questions = questionIdentifier.convertToQuestions(blocks);
  console.log(`[MinerU Client] 提取到 ${questions.length} 道有效题目`);
  
  return questions;
}

/**
 * 处理PDF文件（主函数）
 */
export async function processPDF(
  filePath: string,
  outputDir: string
): Promise<MinerUResult> {
  try {
    console.log(`\n处理PDF: ${path.basename(filePath)}`);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath, '.pdf');

    // 生成唯一时间戳，确保每次识别的中间产物不冲突
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;

    // 1. 上传文件
    const serverFilePath = await uploadPDF(filePath);
    if (!serverFilePath) {
      return { success: false, error: '上传失败' };
    }

    // 2. 调用预测
    const predictResult = await predictPDF(serverFilePath, path.basename(filePath), stats.size);
    if (!predictResult) {
      return { success: false, error: '识别失败' };
    }

    // 3. 提取zip URL
    const zipUrl = extractZipUrl(predictResult);
    if (!zipUrl) {
      return { success: false, error: '无法获取结果URL' };
    }

    // 4. 下载结果（使用时间戳确保唯一性）
    const extractDir = await downloadResult(zipUrl, outputDir, uniqueFileName);
    if (!extractDir) {
      return { success: false, error: '下载结果失败' };
    }

    // 5. 读取markdown内容
    const markdownContent = readMarkdownContent(extractDir);
    if (!markdownContent) {
      return { success: false, error: '读取结果失败' };
    }

    // 6. 保存原始markdown内容（带时间戳，避免覆盖）
    const markdownSavePath = path.join(outputDir, `${uniqueFileName}-raw.md`);
    fs.writeFileSync(markdownSavePath, markdownContent, 'utf-8');
    console.log(`  [MinerU] 原始内容已保存: ${markdownSavePath}`);

    // 7. 提取题目
    const questions = extractQuestionsFromMarkdown(markdownContent);

    console.log(`  [MinerU] 识别完成，共 ${questions.length} 道题目`);

    return {
      success: true,
      markdownContent,
      questions,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}
