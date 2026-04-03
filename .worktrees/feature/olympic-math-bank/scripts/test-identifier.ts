/**
 * 测试 HybridQuestionIdentifier 识别逻辑
 */

import { HybridQuestionIdentifier } from '../lib/ocr/question-identifier';

// 测试用例
const testCases = [
  {
    name: '简单单题',
    content: `例题1
计算：1 + 2 = ?
【答案】3
【解析】简单的加法运算。`
  },
  {
    name: '多题列表',
    content: `练习题
1. 计算 2 + 3 = ?
【答案】5
【解析】加法运算。

2. 计算 5 - 2 = ?
【答案】3
【解析】减法运算。

3. 计算 3 × 4 = ?
【答案】12
【解析】乘法运算。`
  },
  {
    name: '带选项的选择题',
    content: `选择题
1. 2 + 2 = ?
A. 3
B. 4
C. 5
【答案】B
【解析】2加2等于4。`
  },
  {
    name: '中文序号',
    content: `练习题
一、填空题
1. 3 + 5 = __
【答案】8

2. 10 - 4 = __
【答案】6

二、计算题
1. 12 + 23 = __
【答案】35`
  },
  {
    name: '混合内容',
    content: `# 第四讲 牛吃草

## 学习目标
掌握牛吃草问题的基本解法。

## 典型例题

### 例题1
一片草地，10头牛可以吃20天，15头牛可以吃10天。问25头牛可以吃几天？
【答案】5天
【解析】设草每天生长量为x，原有草量为y。

### 例题2
一片草地，20头牛可以吃30天。问多少头牛可以吃15天？
【答案】40头
【解析】根据牛吃草公式计算。`
  }
];

console.log('🧪 测试 HybridQuestionIdentifier\n');

for (const testCase of testCases) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 测试: ${testCase.name}`);
  console.log(`${'='.repeat(60)}`);

  const identifier = new HybridQuestionIdentifier();
  const blocks = identifier.splitContent(testCase.content);

  console.log(`识别到 ${blocks.length} 个题目块:\n`);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    console.log(`  [${i + 1}] ${'-'.repeat(50)}`);
    console.log(`  内容预览: ${block.content.substring(0, 80).replace(/\n/g, ' ')}...`);
    console.log(`  有答案: ${block.hasAnswer ? '✅' : '❌'}`);
    console.log(`  有图片: ${block.hasImage ? '🖼️' : '❌'}`);
    if (block.answer) {
      console.log(`  答案预览: ${block.answer.substring(0, 60).replace(/\n/g, ' ')}...`);
    }
    console.log();
  }
}

console.log('\n✅ 测试完成!');
