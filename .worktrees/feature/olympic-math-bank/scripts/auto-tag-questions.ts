/**
 * 自动为题目打标签脚本
 * 读取questions.json中的题目，自动匹配知识点标签
 */

import { PrismaClient } from '@prisma/client';
import { knowledgeKeywords, getTagPath } from '../lib/ocr/knowledge-keywords';
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
    console.error(`❌ 文件不存在: ${questionsPath}`);
    console.log('请先运行OCR识别生成questions.json');
    process.exit(1);
  }

  const questions: QuestionData[] = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
  console.log(`📚 读取到 ${questions.length} 道题目\n`);

  // 获取所有知识标签（所有级别）
  const allTags = await prisma.knowledgeTag.findMany({
    include: {
      parent: {
        include: {
          parent: {
            include: {
              parent: {
                include: { parent: true }
              }
            }
          }
        }
      }
    }
  });

  console.log(`🏷️ 数据库中有 ${allTags.length} 个知识标签`);
  console.log(`  - 一级(模块): ${allTags.filter(t => t.level === 1).length} 个`);
  console.log(`  - 二级(专题): ${allTags.filter(t => t.level === 2).length} 个`);
  console.log(`  - 三级(子专题): ${allTags.filter(t => t.level === 3).length} 个`);
  console.log(`  - 四级(知识点): ${allTags.filter(t => t.level === 4).length} 个`);
  console.log(`  - 五级(技能): ${allTags.filter(t => t.level === 5).length} 个\n`);

  // 为每道题匹配标签
  const results: Array<{
    questionIndex: number;
    content: string;
    matchedTags: Array<{ name: string; level: number; path: string; score: number }>;
  }> = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const searchText = (q.content + ' ' + (q.answer || '') + ' ' + (q.analysis || '')).toLowerCase();

    console.log(`\n第 ${i + 1} 题:`);
    console.log(`  题干: ${q.content.substring(0, 60).replace(/\n/g, ' ')}...`);

    // 匹配标签（所有级别）
    const matchedScores: Array<{
      tagId: string;
      tagName: string;
      score: number;
      level: number;
      path: string;
    }> = [];

    for (const tag of allTags) {
      const keywords = knowledgeKeywords[tag.name] || [tag.name];
      let score = 0;

      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        if (searchText.includes(keywordLower)) {
          score += 1;
        }
        // 精确匹配（需要转义特殊字符）
        try {
          const escapedKeyword = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const exactMatch = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
          if (exactMatch.test(searchText)) {
            score += 2;
          }
        } catch (e) {
          // 如果正则表达式无效，跳过精确匹配
        }
      }

      if (score > 0) {
        matchedScores.push({
          tagId: tag.id,
          tagName: tag.name,
          score,
          level: tag.level,
          path: getTagPath(tag)
        });
      }
    }

    // 按分数和级别排序（分数相同，级别高的优先）
    matchedScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.level - a.level; // 级别高的优先
    });

    // 去重：如果同一分支下有多个匹配，只保留最具体的一个
    const uniqueMatches: typeof matchedScores = [];
    const usedPaths = new Set<string>();

    for (const match of matchedScores) {
      // 检查是否已经有更具体的标签包含这个路径
      const isMoreSpecific = uniqueMatches.some(um =>
        match.path.startsWith(um.path) && match.path !== um.path
      );

      if (!isMoreSpecific) {
        uniqueMatches.push(match);
        usedPaths.add(match.path);
      }

      if (uniqueMatches.length >= 3) break;
    }

    const topMatches = uniqueMatches.slice(0, 3);

    console.log(`  匹配到 ${matchedScores.length} 个标签，选择前 ${topMatches.length} 个:`);

    const matchedTagDetails = topMatches.map(m => {
      console.log(`    - ${m.tagName} (级别: ${m.level}, 分数: ${m.score})`);
      console.log(`      路径: ${m.path}`);
      return { name: m.tagName, level: m.level, path: m.path, score: m.score };
    });

    results.push({
      questionIndex: i + 1,
      content: q.content,
      matchedTags: matchedTagDetails,
    });
  }

  // 保存结果
  const outputPath = path.join(process.cwd(), 'test-output', 'tagged-questions.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\n\n✅ 标签匹配完成！`);
  console.log(`📄 结果已保存: ${outputPath}`);

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

  return results;
}

autoTagQuestions()
  .then(results => {
    console.log('\n=== 详细结果 ===\n');
  results.forEach(r => {
    console.log(`第 ${r.questionIndex} 题:`);
    if (r.matchedTags.length > 0) {
      r.matchedTags.forEach(t => {
        console.log(`  - ${t.name} (L${t.level})`);
      });
    } else {
      console.log('  标签: 无');
    }
  });
  })
  .catch(console.error)
  .finally(() => prisma.$disconnect());
