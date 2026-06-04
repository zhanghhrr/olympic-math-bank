"use strict";
/**
 * 题目识别测试脚本
 * 直接测试 HybridQuestionIdentifier 的识别效果
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const question_identifier_1 = require("../lib/ocr/question-identifier");
const MD_FILE = 'c:/Users/Twilight/.codebuddy/.worktrees/feature/olympic-math-bank/test-output/1774780602173/output_web/extracted/26春季三年级第四周刷题课-集训队教师版.md';
function main() {
    console.log('========================================');
    console.log('题目识别测试');
    console.log('========================================\n');
    // 读取 markdown 文件
    const content = (0, fs_1.readFileSync)(MD_FILE, 'utf-8');
    console.log(`📄 文件内容长度: ${content.length} 字符\n`);
    // 使用 HybridQuestionIdentifier 进行识别
    const identifier = new question_identifier_1.HybridQuestionIdentifier();
    const blocks = identifier.splitContent(content);
    console.log(`✅ 识别到 ${blocks.length} 个文本块\n`);
    // 显示每个块的详细信息
    blocks.forEach((block, index) => {
        console.log(`----------------------------------------`);
        console.log(`【块 ${index + 1}】类型: ${block.type}`);
        if (block.header) {
            console.log(`标题: ${block.header}`);
        }
        console.log(`有答案: ${block.hasAnswer ? '是' : '否'}`);
        console.log(`有图片: ${block.hasImage ? '是' : '否'}`);
        console.log(`内容长度: ${block.content.length} 字符`);
        console.log(`内容预览:`);
        console.log(block.content.slice(0, 200).replace(/\n/g, ' ') + '...');
        console.log();
    });
    // 转换为题目格式
    console.log('========================================');
    console.log('转换后的题目格式');
    console.log('========================================\n');
    const questions = identifier.convertToQuestions(blocks);
    console.log(`✅ 共 ${questions.length} 道题目\n`);
    // 显示每道题目的详细信息
    questions.forEach((q, index) => {
        console.log(`========================================`);
        console.log(`【题目 ${index + 1}】${q.title || '未命名'}`);
        console.log(`========================================`);
        console.log('\n📖 题干:');
        console.log(q.content);
        if (q.answer) {
            console.log('\n✅ 答案:');
            console.log(q.answer);
        }
        if (q.analysis) {
            console.log('\n💡 解析:');
            console.log(q.analysis);
        }
        if (q.hasImage) {
            console.log('\n🖼️ 包含图片');
        }
        console.log('\n');
    });
    // 生成题库格式 JSON
    console.log('========================================');
    console.log('题库格式 JSON (前3题)');
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
    console.log('\n========================================');
    console.log(`测试完成，共识别 ${questions.length} 道题目`);
    console.log('========================================');
}
main();
