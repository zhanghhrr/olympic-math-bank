/**
 * 自动为题目打标签脚本
 * 读取 test-output/questions.json 中的题目，使用统一入口 autoMatchKnowledgeTagsWithScores() 匹配知识标签
 */

import { PrismaClient } from '@prisma/client';
import { autoMatchKnowledgeTagsWithScores, getTagTree, clearTagTreeCache, type ScoredTag } from '../lib/ocr/tagging';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface QuestionData {
  content: string;
  answer?: string;
  analysis?: string;
  type?: string;
  hasImage?: boolean;
}

async function autoTagQuestions() {
  console.log('=== 自动为题目打标签 ===\n');

  // 读取questions.json文件
  const questionsPath = path.join(process.cwd(), 'test-output', 'questions.json');
  if (!fs.existsSync(questionsPath)) {
    console.error(`文件不存在: ${questionsPath}`);
    console.log('请先运行OCR识别生成questions.json');
    process.exit(1);
  }

  const questions: QuestionData[] = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
  console.log(`读取到 ${questions.length} 道题目\n`);

  // 预热标签树缓存
  const allTags = await getTagTree();
  
  // 统计
  console.log(`数据库中有 ${allTags.length} 个知识标签`);
  console.log(`  - 一级(模块): ${allTags.filter((t: any) => t.level === 1).length} 个`);
  console.log(`  - 二级(专题): ${allTags.filter((t: any) => t.level === 2).length} 个`);
  console.log(`  - 三级(子专题): ${allTags.filter((t: any) => t.level === 3).length} 个`);
  console.log(`  - 四级(知识点): ${allTags.filter((t: any) => t.level === 4).length} 个`);
  console.log(`  - 五级(技能): ${allTags.filter((t: any) => t.level === 5).length} 个\n`);

  // 使用统一入口 autoMatchKnowledgeTagsWithScores 为每道题匹配标签
  const results: Array<{
    questionIndex: number;
    content: string;
    matchedTags: Array<{ name: string; level: number; path: string; score: number; matchSource: string }>;
  }> = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const searchText = (q.content + ' ' + (q.answer || '') + ' ' + (q.analysis || '')).trim();

    console.log(`第 ${i + 1} 题:`);
    console.log(`  题干: ${q.content.substring(0, 60).replace(/\n/g, ' ')}...`);

    const { scoredTags } = await autoMatchKnowledgeTagsWithScores(searchText);

    console.log(`  匹配到 ${scoredTags.length} 个标签:`);

    const tagDetails = scoredTags.map((s: ScoredTag) => {
      const tag = allTags.find((t: any) => t.id === s.tagId);
      const level = tag?.level ?? 0;
      console.log(`    - ${s.tagName} (级别: ${level}, 分数: ${s.score}, 来源: ${s.matchSource})`);
      if (s.path) console.log(`      路径: ${s.path}`);
      return { name: s.tagName, level, path: s.path, score: s.score, matchSource: s.matchSource };
    });

    results.push({
      questionIndex: i + 1,
      content: q.content,
      matchedTags: tagDetails,
    });
  }

  // 保存结果
  const outputPath = path.join(process.cwd(), 'test-output', 'tagged-questions.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\n标签匹配完成！`);
  console.log(`结果已保存: ${outputPath}`);

  // 统计信息
  console.log('\n=== 统计信息 ===');
  const totalMatched = results.filter(r => r.matchedTags.length > 0).length;
  console.log(`有标签的题目: ${totalMatched}/${questions.length}`);

  // 按模块统计
  const moduleStats: Record<string, number> = {};
  for (const r of results) {
    for (const tag of r.matchedTags) {
      const moduleName = tag.path.split(' > ')[0];
      moduleStats[moduleName] = (moduleStats[moduleName] || 0) + 1;
    }
  }
  console.log('\n模块分布:');
  for (const [module, count] of Object.entries(moduleStats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${module}: ${count} 次`);
  }

  // 按级别统计
  const levelStats: Record<number, number> = {};
  for (const r of results) {
    for (const tag of r.matchedTags) {
      levelStats[tag.level] = (levelStats[tag.level] || 0) + 1;
    }
  }
  console.log('\n标签级别分布:');
  const levelNames = ['', '模块', '专题', '子专题', '知识点', '技能'];
  for (const [level, count] of Object.entries(levelStats).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    console.log(`  ${levelNames[parseInt(level)]}(L${level}): ${count} 次`);
  }

  // 按匹配来源统计
  const sourceStats: Record<string, number> = {};
  for (const r of results) {
    for (const tag of r.matchedTags) {
      sourceStats[tag.matchSource] = (sourceStats[tag.matchSource] || 0) + 1;
    }
  }
  console.log('\n匹配来源分布:');
  for (const [source, count] of Object.entries(sourceStats)) {
    console.log(`  ${source}: ${count} 次`);
  }

  return results;
}

autoTagQuestions()
  .then(results => {
    console.log('\n=== 详细结果 ===\n');
    results.forEach(r => {
      console.log(`第 ${r.questionIndex} 题:`);
      if (r.matchedTags.length > 0) {
        r.matchedTags.forEach(t => {
          console.log(`  - ${t.name} (L${t.level}, ${t.matchSource})`);
        });
      } else {
        console.log('  标签: 无');
      }
    });
  })
  .catch(console.error)
  .finally(() => {
    clearTagTreeCache();
    prisma.$disconnect();
  });
