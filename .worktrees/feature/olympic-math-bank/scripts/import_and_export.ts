/**
 * 完整导入→导出流程脚本
 * 用法: 
 *   设置环境变量后运行:
 *     $env:TEST_PHONE="手机号"; $env:TEST_PASSWORD="密码"; npx tsx scripts/import_and_export.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:3000';
const PDF_PATH = 'C:\\Users\\Twilight\\Desktop\\【26春季】三年级第十二周刷题课(教师版).pdf';
const CREDENTIALS = {
  phone: process.env.TEST_PHONE || '',
  password: process.env.TEST_PASSWORD || '',
};

let sessionCookie = '';

function extractCookies(res: Response): string[] {
  // Node.js 18+ fetch 支持 getSetCookie()
  const raw = res.headers.get('set-cookie');
  console.log('  [DEBUG] raw Set-Cookie:', raw?.slice(0, 400));

  // 优先使用 getSetCookie() API
  const setCookie = (res.headers as any).getSetCookie?.();
  if (setCookie && Array.isArray(setCookie) && setCookie.length > 0) {
    return setCookie.map((c: string) => c.split(';')[0]);
  }

  if (!raw) return [];

  // 手动解析：找到每个 "key=" 模式来分割多个 cookie
  const cookies: string[] = [];
  const re = /(?:^|,\s*)(next-auth\.[^=]+=[^;]+)/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    cookies.push(match[1]);
  }
  return cookies;
}

async function login(): Promise<void> {
  console.log('\n🔐 正在登录...');

  // 1. 获取 CSRF token（带上返回的 cookie 进行后续请求）
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfData = await csrfRes.json();
  const csrfCookies = extractCookies(csrfRes);
  const csrfCookieStr = csrfCookies.join('; ');

  const csrfToken = csrfData.csrfToken;
  console.log('  CSRF token:', csrfToken?.slice(0, 20) + '...');

  // 2. 发送登录请求，带上 CSRF cookie
  const params = new URLSearchParams();
  params.append('csrfToken', csrfToken);
  params.append('phone', CREDENTIALS.phone);
  params.append('password', CREDENTIALS.password);

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrfCookieStr,
    },
    body: params.toString(),
    redirect: 'manual',
  });

  console.log('  登录状态:', loginRes.status);

  const loginCookies = extractCookies(loginRes);
  const sessionTokenCookie = loginCookies.find(c => c.includes('session-token'));
  if (!sessionTokenCookie) {
    const bodyText = await loginRes.text();
    throw new Error(`登录失败 (状态码 ${loginRes.status}): ${bodyText.slice(0, 200)}`);
  }

  sessionCookie = sessionTokenCookie;
  console.log('✅ 登录成功');
}

function authHeaders(): Record<string, string> {
  return sessionCookie ? { Cookie: sessionCookie } : {};
}

async function uploadAndOCR(pdfPath: string) {
  console.log(`\n📄 正在上传 PDF: ${path.basename(pdfPath)}`);

  const fileBuffer = fs.readFileSync(pdfPath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });

  const formData = new FormData();
  formData.append('file', blob, path.basename(pdfPath));

  const ocrRes = await fetch(`${BASE}/api/import/ocr`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  if (!ocrRes.ok) {
    const err = await ocrRes.text();
    throw new Error(`OCR 请求失败 (${ocrRes.status}): ${err}`);
  }

  const data = await ocrRes.json();
  console.log(`✅ OCR 识别完成: ${data.questions?.length || 0} 道题目, ${data.totalPages} 页, 耗时 ${data.elapsed}ms`);
  return data;
}

async function confirmImport(questions: any[]) {
  console.log(`\n💾 正在确认导入 ${questions.length} 道题目...`);

  const confirmRes = await fetch(`${BASE}/api/import/confirm`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions }),
  });

  if (!confirmRes.ok) {
    const err = await confirmRes.text();
    throw new Error(`确认导入失败 (${confirmRes.status}): ${err}`);
  }

  const data = await confirmRes.json();
  console.log(`✅ ${data.message}`);
  return data;
}

async function exportMD(questionIds: string[]) {
  console.log(`\n📝 正在导出 ${questionIds.length} 道题目为 MD...`);

  const exportRes = await fetch(`${BASE}/api/export/md`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionIds }),
  });

  if (!exportRes.ok) {
    const err = await exportRes.text();
    throw new Error(`导出失败 (${exportRes.status}): ${err}`);
  }

  const md = await exportRes.text();
  const outputPath = path.join(process.cwd(), 'uploads', 'exports', '导入导出结果.md');
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, md, 'utf-8');

  console.log('='.repeat(60));
  console.log(md);
  console.log('='.repeat(60));
  console.log(`\n📁 MD 文件已保存至: ${outputPath}`);
  return md;
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDF 文件不存在: ${PDF_PATH}`);
    process.exit(1);
  }

  try {
    // 0. 登录
    await login();

    // 1. OCR
    const ocrResult = await uploadAndOCR(PDF_PATH);

    if (!ocrResult.questions || ocrResult.questions.length === 0) {
      console.log('❌ 未识别到任何题目');
      process.exit(1);
    }

    // 构建确认用的预览数据
    const previewQuestions = ocrResult.questions.map((q: any) => ({
      content: q.content,
      answer: q.answer,
      solution: q.solution,
      type: q.type,
      difficulty: q.difficulty,
      grade: q.grade,
      source: q.source,
      matchedTags: q.matchedTags || [],
      formulas: q.formulas || null,
      sourceBlocks: q.sourceBlocks || null,
    }));

    // 2. 确认导入
    const confirmResult = await confirmImport(previewQuestions);

    // 3. 获取刚导入的题目 ID（取最新的 N 条）
    const questionsRes = await fetch(`${BASE}/api/questions?limit=${ocrResult.questions.length}`, {
      headers: authHeaders(),
    });
    const questionsData = await questionsRes.json();
    const questionIds = (questionsData.questions || []).map((q: any) => q.id);

    if (questionIds.length === 0) {
      console.log('❌ 导入后未找到题目');
      process.exit(1);
    }

    // 4. 导出
    await exportMD(questionIds);

  } catch (error) {
    console.error('❌ 流程失败:', error);
    process.exit(1);
  }
}

main();
