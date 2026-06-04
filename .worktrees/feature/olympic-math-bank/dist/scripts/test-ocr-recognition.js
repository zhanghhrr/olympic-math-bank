"use strict";
/**
 * OCR 识别测试脚本
 * 复用项目内的代码测试 PDF 识别效果
 */
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = require("path");
const fs_1 = require("fs");
const question_identifier_1 = require("../lib/ocr/question-identifier");
const TEST_PDF_PATH = 'C:/Users/Twilight/Desktop/【26春季】三年级第四周刷题课-集训队(教师版).pdf';
const WORK_DIR = (0, path_1.join)(process.cwd(), 'test-output', Date.now().toString());
async function main() {
    console.log('========================================');
    console.log('MinerU OCR 识别测试 (项目内代码复用)');
    console.log('========================================\n');
    // 检查文件是否存在
    if (!(0, fs_1.existsSync)(TEST_PDF_PATH)) {
        console.error(`❌ 文件不存在: ${TEST_PDF_PATH}`);
        process.exit(1);
    }
    console.log(`📄 测试文件: ${TEST_PDF_PATH.split('/').pop()}`);
    console.log(`📁 工作目录: ${WORK_DIR}\n`);
    // 创建工作目录
    (0, fs_1.mkdirSync)(WORK_DIR, { recursive: true });
    const inputDir = (0, path_1.join)(WORK_DIR, 'input');
    const mdDir = (0, path_1.join)(WORK_DIR, 'md_files');
    (0, fs_1.mkdirSync)(inputDir, { recursive: true });
    (0, fs_1.mkdirSync)(mdDir, { recursive: true });
    // 复制 PDF 到输入目录
    const { copyFileSync } = require('fs');
    const path = require('path');
    const pdfName = path.basename(TEST_PDF_PATH);
    copyFileSync(TEST_PDF_PATH, (0, path_1.join)(inputDir, pdfName));
    // 调用 Python 脚本进行 OCR
    console.log('🚀 开始 OCR 识别...\n');
    const pythonScript = (0, path_1.join)(process.cwd(), 'lib', 'ocr', 'web_pdf_converter.py');
    try {
        // 使用 Python 脚本处理
        const result = (0, child_process_1.execSync)(`python "${pythonScript}" "${inputDir}"`, {
            cwd: WORK_DIR,
            encoding: 'utf-8',
            timeout: 300000
        });
        console.log(result);
    }
    catch (error) {
        console.error('❌ OCR 识别失败:', error.message);
        if (error.stdout)
            console.log('stdout:', error.stdout.toString());
        if (error.stderr)
            console.log('stderr:', error.stderr.toString());
        process.exit(1);
    }
    // 检查输出目录
    const outputDirs = (0, fs_1.readdirSync)(WORK_DIR).filter(f => f.startsWith('output_'));
    if (outputDirs.length === 0) {
        console.error('❌ 未找到 OCR 输出目录');
        process.exit(1);
    }
    const outputDir = (0, path_1.join)(WORK_DIR, outputDirs[0], 'md_files');
    // 读取所有 markdown 文件
    const mdFiles = (0, fs_1.readdirSync)(outputDir).filter(f => f.endsWith('.md'));
    console.log(`\n📚 找到 ${mdFiles.length} 个 Markdown 文件`);
    let fullContent = '';
    for (const mdFile of mdFiles.sort()) {
        const content = (0, fs_1.readFileSync)((0, path_1.join)(outputDir, mdFile), 'utf-8');
        fullContent += content + '\n\n';
    }
    // 保存原始内容
    const rawMdPath = (0, path_1.join)(WORK_DIR, 'combined_raw.md');
    // require('fs').writeFileSync(rawMdPath, fullContent);
    console.log(`📝 原始内容长度: ${fullContent.length} 字符`);
    // 使用 HybridQuestionIdentifier 进行智能识别
    console.log('\n🔍 开始智能题目识别...\n');
    const identifier = new question_identifier_1.HybridQuestionIdentifier();
    const blocks = identifier.splitContent(fullContent);
    console.log(`✅ 识别到 ${blocks.length} 个文本块`);
    const questions = identifier.convertToQuestions(blocks);
    console.log(`✅ 提取到 ${questions.length} 道有效题目\n`);
    // 显示识别结果
    console.log('========================================');
    console.log('识别结果详情');
    console.log('========================================\n');
    questions.forEach((q, index) => {
        console.log(`----------------------------------------`);
        console.log(`【题目 ${index + 1}】${q.title || '未命名'}`);
        console.log(`----------------------------------------`);
        console.log(`📖 题干 (${q.content?.length || 0} 字符):`);
        const contentPreview = q.content?.slice(0, 300).replace(/\n/g, ' ') || '';
        console.log(contentPreview + (q.content && q.content.length > 300 ? '...' : ''));
        console.log();
        if (q.answer) {
            console.log(`✅ 答案 (${q.answer?.length || 0} 字符):`);
            const answerPreview = q.answer?.slice(0, 200).replace(/\n/g, ' ') || '';
            console.log(answerPreview + (q.answer && q.answer.length > 200 ? '...' : ''));
            console.log();
        }
        if (q.analysis) {
            console.log(`💡 解析 (${q.analysis?.length || 0} 字符):`);
            const analysisPreview = q.analysis?.slice(0, 200).replace(/\n/g, ' ') || '';
            console.log(analysisPreview + (q.analysis && q.analysis.length > 200 ? '...' : ''));
            console.log();
        }
        if (q.hasImage) {
            console.log(`🖼️ 包含图片`);
        }
        console.log();
    });
    // 生成题库格式 JSON
    console.log('========================================');
    console.log('题库格式预览 (前3题)');
    console.log('========================================\n');
    const questionBankFormat = questions.slice(0, 3).map((q, index) => ({
        id: `temp-${index + 1}`,
        title: q.title || `题目${index + 1}`,
        content: q.content,
        answer: q.answer || '',
        analysis: q.analysis || '',
        grade: 'P3',
        source: '26春季三年级第四周刷题课-集训队',
        hasImage: q.hasImage || false,
        difficulty: 3,
        type: 'SOLUTION'
    }));
    console.log(JSON.stringify(questionBankFormat, null, 2));
    // 保存完整结果
    const resultPath = (0, path_1.join)(WORK_DIR, 'parsed_result.json');
    // require('fs').writeFileSync(
    //   resultPath,
    //   JSON.stringify({
    //     totalQuestions: questions.length,
    //     questions: questionBankFormat
    //   }, null, 2)
    // );
    console.log(`\n💾 完整结果已保存到: ${WORK_DIR}`);
    console.log('\n========================================');
    console.log('测试完成');
    console.log(`共识别 ${questions.length} 道题目`);
    console.log('========================================');
}
main().catch(console.error);
