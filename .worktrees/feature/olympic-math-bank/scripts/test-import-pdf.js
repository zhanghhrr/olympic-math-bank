/**
 * 端到端 PDF 导入测试脚本
 * 使用 Puppeteer 自动化以下流程：
 * 1. 登录
 * 2. 导航到导入页面
 * 3. 上传 PDF 文件（异步模式）
 * 4. 轮询导入状态
 * 5. 验证结果
 *
 * 用法:
 *   设置环境变量后运行:
 *     $env:TEST_EMAIL="admin@example.com"; $env:TEST_PASSWORD="yourpassword"; node scripts/test-import-pdf.js
 */
const puppeteer = require('puppeteer');
const path = require('path');

const PDF_PATH = 'C:\\Users\\Twilight\\Desktop\\【26春季】三年级第十一周刷题课(教师版).pdf';
const BASE_URL = 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL || 'admin@example.com';
const PASSWORD = process.env.TEST_PASSWORD || '';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== PDF 导入端到端测试 ===\n');
  
  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    
    // 监听控制台输出
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('[BROWSER ERROR]', msg.text());
    });
    
    page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));
    
    // 1. 登录
    console.log('[1/5] 登录...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('input[name="email"], #email, input[type="email"]', EMAIL);
    await page.type('input[name="password"], #password, input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]')
    ]);
    
    const url = page.url();
    if (url.includes('/login')) {
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('  [失败] 登录失败，页面内容:', bodyText.substring(0, 200));
      return;
    }
    console.log('  [成功] 已登录, 当前 URL:', url);
    
    // 2. 导航到导入页面
    console.log('\n[2/5] 导航到导入页面...');
    await page.goto(`${BASE_URL}/dashboard/import`, { waitUntil: 'networkidle0' });
    await sleep(2000);
    
    // 选择"PDF智能导入" tab
    const pdfTabBtn = await page.$('button:has-text("PDF智能导入")');
    if (pdfTabBtn) {
      await pdfTabBtn.click();
      await sleep(500);
      console.log('  [成功] PDF 智能导入 tab 已激活');
    }
    
    // 选择年级：三年级
    console.log('  选择三年级...');
    const gradeBtn = await page.$('button:has-text("三年级")');
    if (gradeBtn) {
      await gradeBtn.click();
      await sleep(500);
      console.log('  [成功] 已选择三年级');
    }
    
    // 启用异步模式
    const asyncCheckbox = await page.$('input[type="checkbox"][id*="async"], input[type="checkbox"][name*="async"]');
    if (!asyncCheckbox) {
      // 尝试找包含 "异步" 文字的标签
      const asyncLabel = await page.$('label:has-text("异步")');
      if (asyncLabel) {
        await asyncLabel.click();
        await sleep(300);
        console.log('  [成功] 已启用异步模式');
      }
    }
    
    // 启用自动标签匹配（默认应已开启）
    const autoTagCheckbox = await page.$('input[type="checkbox"]:checked');
    if (autoTagCheckbox) {
      console.log('  自动标签匹配已开启');
    }
    
    // 3. 上传 PDF 文件
    console.log('\n[3/5] 上传 PDF 文件...');
    const fileInput = await page.$('#file-input, input[type="file"]');
    if (!fileInput) {
      console.log('  [错误] 未找到文件输入元素');
      // 打印页面结构帮助调试
      const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(el => ({ type: el.type, id: el.id, name: el.name }));
      });
      console.log('  页面中所有 input 元素:', JSON.stringify(inputs, null, 2));
      return;
    }
    
    await fileInput.uploadFile(PDF_PATH);
    console.log('  [成功] PDF 文件已选择:', path.basename(PDF_PATH));
    
    // 等待上传区域反映文件已选择
    await sleep(1000);
    
    // 点击上传/开始处理按钮
    let uploadBtn = await page.$('button:has-text("开始处理"), button:has-text("上传"), button:has-text("确认导入")');
    if (!uploadBtn) {
      // 尝试找到主要操作按钮
      const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim().substring(0, 30));
      });
      console.log('  页面按钮:', JSON.stringify(buttons));
    }
    
    if (uploadBtn) {
      console.log('  点击上传按钮...');
      await uploadBtn.click();
      await sleep(3000);
    } else {
      console.log('  [警告] 未找到上传按钮，尝试自动提交...');
    }
    
    // 4. 轮询导入状态
    console.log('\n[4/5] 等待导入完成（轮询中）...');
    let completed = false;
    let attempts = 0;
    const maxAttempts = 60; // 最多等3分钟
    
    while (!completed && attempts < maxAttempts) {
      attempts++;
      await sleep(3000);
      
      const status = await page.evaluate(() => {
        // 寻找进度/状态指示
        const body = document.body.innerText;
        // 检查是否完成
        if (body.includes('预览') || body.includes('确认导入')) return 'preview';
        if (body.includes('完成') && !body.includes('处理中')) return 'completed';
        if (body.includes('失败') || body.includes('错误')) return 'failed';
        if (body.includes('处理中')) return 'processing';
        return 'unknown';
      });
      
      if (status === 'preview' || status === 'completed') {
        console.log(`  [成功] 导入完成！状态: ${status} (尝试次数: ${attempts})`);
        completed = true;
      } else if (status === 'failed') {
        console.log(`  [失败] 导入失败！状态: ${status}`);
        completed = true;
      } else {
        if (attempts % 5 === 0) console.log(`  轮询中... (${attempts * 3}s, 状态: ${status})`);
      }
    }
    
    if (!completed) {
      console.log('  [超时] 导入未在3分钟内完成');
    }
    
    // 5. 获取结果并截图
    console.log('\n[5/5] 获取结果...');
    await sleep(2000);
    
    // 截图
    await page.screenshot({ 
      path: path.join(__dirname, '..', 'import-test-result.png'),
      fullPage: true 
    });
    console.log('  截图已保存: import-test-result.png');
    
    // 获取页面内容
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== 导入结果预览 ===');
    console.log(pageText.substring(0, 3000));
    
    // 如果有预览题目，获取题目数量
    const questionCount = await page.evaluate(() => {
      const cards = document.querySelectorAll('[class*="question-card"], [class*="QuestionCard"]');
      return cards.length;
    });
    console.log(`\n识别到的题目数量: ${questionCount}`);
    
  } catch (err) {
    console.error('脚本执行错误:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    // 保持浏览器打开一会儿以便手动查看
    console.log('\n浏览器将在 10 秒后关闭...');
    await sleep(10000);
    await browser.close();
    console.log('浏览器已关闭');
  }
}

main().catch(console.error);
