/**
 * 重新整理题目的知识标签：根据关键词库打分，只保留最匹配的标签及其父级
 * 运行方式: npx tsx scripts/rebuild-question-tags.ts
 */

import { PrismaClient } from '@prisma/client';
import { calculateTagScore } from '../lib/ocr/tagging';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./lib/db/test.db'
    }
  }
});

// 关键词库（从 knowledge-keywords.ts 复制）
const knowledgeKeywords: Record<string, string[]> = {
  '加法横式': ['加法横式', '横式加法', '横式计算', '横式'],
  '加法竖式': ['加法竖式', '竖式加法', '竖式计算', '进位加法'],
  '减法横式': ['减法横式', '横式减法'],
  '减法竖式': ['减法竖式', '竖式减法', '退位减法'],
  '加减巧算': ['加减巧算', '凑整', '凑成整', '凑十', '凑百', '加法交换律', '加法结合律'],
  '乘法运算': ['乘法', '乘号', '×', '*', '乘数', '被乘数', '积'],
  '除法运算': ['除法', '除号', '÷', '/', '除数', '被除数', '商', '余数'],
  '乘除巧算': ['乘除巧算', '提取公因数', '公因数', '乘法分配律', '乘法交换律', '乘法结合律'],
  '小数加减': ['小数加', '小数减', '小数加减'],
  '小数乘除': ['小数乘', '小数除', '小数乘除', '小数点移动'],
  '分数加减': ['分数加', '分数减', '分数加减', '通分', '约分'],
  '分数乘除': ['分数乘', '分数除', '分数乘除', '倒数'],
  '分数巧算': ['分数巧算', '分数拆分', '裂项'],
  '整数混合运算': ['整数混合', '四则运算', '脱式计算', '递等式'],
  '小数混合运算': ['小数混合', '小数四则'],
  '分数混合运算': ['分数混合', '分数四则'],
  '等差数列': ['等差数列', '等差', '首项', '末项', '项数', '公差'],
  '等比数列': ['等比数列', '等比', '公比'],
  '数列求和': ['数列求和', '求和公式', '高斯求和'],
  '长方形': ['长方形', '矩形', '长宽'],
  '正方形': ['正方形', '正方', '四边相等'],
  '三角形': ['三角形', '△', '三角', '三边'],
  '平行四边形': ['平行四边形', '平行四边'],
  '梯形': ['梯形', '上底', '下底', '腰'],
  '圆形': ['圆', '半径', '直径', 'π', '圆周率', '圆心', '圆弧'],
  '角度计算': ['角度', '角的计算', '度数', '直角', '锐角', '钝角', '平角', '周角'],
  '三角形内角和': ['三角形内角', '内角和'],
  '周长计算': ['周长', '周长计算', '一圈长度'],
  '面积计算': ['面积', '面积计算', '占地面积', '表面积'],
  '长方形面积': ['长方形面积', '矩形面积'],
  '正方形面积': ['正方形面积'],
  '三角形面积': ['三角形面积', '底高'],
  '平行四边形面积': ['平行四边形面积'],
  '梯形面积': ['梯形面积'],
  '圆的周长': ['圆的周长', '圆周长'],
  '圆的面积': ['圆的面积', '圆面积'],
  '平移': ['平移', '平移变换'],
  '旋转': ['旋转', '旋转变换', '旋转对称'],
  '轴对称': ['轴对称', '对称轴', '对称图形'],
  '割补法': ['割补', '割补法', '图形割补'],
  '长方体': ['长方体', '长方'],
  '正方体': ['正方体', '立方体'],
  '圆柱': ['圆柱', '圆柱体'],
  '圆锥': ['圆锥', '圆锥体'],
  '体积计算': ['体积', '容积', '体积计算'],
  '表面积计算': ['表面积', '表面积计算'],
  '和差问题': ['和差', '和与差', '两数和', '两数差'],
  '和倍问题': ['和倍', '倍数和', '和是几倍'],
  '差倍问题': ['差倍', '倍数差', '差是几倍'],
  '归一问题': ['归一', '单一量'],
  '归总问题': ['归总', '总量'],
  '鸡兔同笼': ['鸡兔', '鸡和兔', '鸡兔同笼'],
  '盈亏问题': ['盈亏', '分配问题', '盈', '亏'],
  '年龄问题': ['年龄', '岁数', '年龄差'],
  '植树问题': ['植树', '间隔', '棵数', '段数'],
  '方阵问题': ['方阵', '实心方阵', '空心方阵'],
  '行程问题': ['行程', '速度', '时间', '路程', '速度时间路程'],
  '相遇问题': ['相遇', '相向', '迎面', '相遇时间'],
  '追及问题': ['追及', '追赶', '追上', '追及时间'],
  '流水行船': ['流水', '行船', '顺水', '逆水', '船速', '水速'],
  '火车过桥': ['火车过桥', '过桥', '车长'],
  '环形跑道': ['环形跑道', '环形', '跑道'],
  '工程问题': ['工程', '工作效率', '工作时间', '工作量'],
  '枚举法': ['枚举', '一一列举', '列举', '枚举计数'],
  '树形图': ['树形图', '树状图', '分支'],
  '加法原理': ['加法原理', '分类计数', '分类相加', '分类'],
  '乘法原理': ['乘法原理', '分步计数', '分步相乘', '分步', '分配', '分给', '分发给'],
  '加乘原理综合': ['加乘原理', '加乘综合', '分类分步', '不同分法', '不同方法', '多少种', '几种'],
  '组合计数': ['组合计数', '计数', '数目', '个数', '数量', '多少'],
  '数字组合': ['数字组合', '好数', '四位数', '三位数', '互不相同', '数字不同'],
  '分配问题': ['分配', '分给', '分发给', '每位', '都得到', '既得到'],
  '标数法': ['标数法', '标数', '标注法', '标记法', '数字标注', '最短路线', '最短路径', '路线数', '走法数'],
  '标准标数法': ['标准标数', '基础标数', '只能向右', '只能向上', '向右向上'],
  '阶梯型标数法': ['阶梯标数', '阶梯型', '金字塔'],
  '特殊点或区域': ['特殊点', '特殊区域', '不能经过', '避开', '不经过'],
  '长方形计数': ['长方形计数', '数长方形', '矩形计数', '多少个长方形', '多少个矩形'],
  '正方形计数': ['正方形计数', '数正方形', '多少个正方形'],
  '三角形计数': ['三角形计数', '数三角形', '多少个三角形'],
  '梯形计数': ['梯形计数', '数梯形', '梯形', '多少个梯形'],
  '角计数': ['角计数', '数角', '角的个数'],
  '图形计数综合': ['图形计数', '数图形', '包含', '图中共有', '图中有'],
  '排列': ['排列', '排队', '顺序', '排列数', 'A(n,m)'],
  '组合': ['组合', '选法', '组合数', 'C(n,m)', '无序'],
  '容斥原理': ['容斥', '容斥原理', '包含排斥'],
  '奇偶性': ['奇偶', '奇数', '偶数', '奇偶性'],
  '质数': ['质数', '素数', '质因数'],
  '合数': ['合数'],
  '因数': ['因数', '约数', '因数个数', '因数和'],
  '倍数': ['倍数', '公倍数'],
  '最大公因数': ['最大公因数', 'GCD', 'gcd', '最大公约数'],
  '最小公倍数': ['最小公倍数', 'LCM', 'lcm'],
  '余数': ['余数', '带余除法', '模运算', 'mod'],
  '同余': ['同余', '同余定理'],
  '完全平方数': ['完全平方数', '平方数'],
  '逻辑推理': ['逻辑', '推理', '逻辑推理', '真假'],
  '抽屉原理': ['抽屉', '抽屉原理', '鸽巢原理'],
  '最值问题': ['最值', '最大', '最小', '最大值', '最小值'],
  '操作问题': ['操作', '操作问题', '变换'],
  '数字谜': ['数字谜', '算式谜', '虫食算'],
  '数独': ['数独', '九宫格'],
  '数阵图': ['数阵图', '数阵', '辐射型', '封闭型', '填圆圈', '填入圆圈', '使相等', '和相等', '和为'],
  '方法计数': ['吃法', '方法', '不同吃法', '不同方法', '至少吃', '直到吃完'],
  '排列问题': ['摆成一排', '摆法', '排列', '顺序', '不能摆在', '最右边', '最左边'],
};

function getTagAndParentIds(tag: any): string[] {
  const ids: string[] = [tag.id];
  let current = tag;
  while (current.parent) {
    ids.push(current.parent.id);
    current = current.parent;
  }
  return ids;
}

function getTagPath(tag: any): string {
  const parts: string[] = [];
  if (tag.parent?.parent?.parent?.parent) parts.push(tag.parent.parent.parent.parent.name);
  if (tag.parent?.parent?.parent) parts.push(tag.parent.parent.parent.name);
  if (tag.parent?.parent) parts.push(tag.parent.parent.name);
  if (tag.parent) parts.push(tag.parent.name);
  parts.push(tag.name);
  return parts.join(' - ');
}

async function main() {
  console.log('开始重新整理题目标签...\n');

  // 获取所有题目及其知识标签
  const questions = await prisma.question.findMany({
    include: {
      knowledgeTags: {
        include: {
          knowledgeTag: {
            include: {
              parent: {
                include: {
                  parent: {
                    include: {
                      parent: {
                        include: {
                          parent: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  console.log(`共找到 ${questions.length} 道题目\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const question of questions) {
    if (question.knowledgeTags.length === 0) {
      skippedCount++;
      continue;
    }

    // 计算每个标签的匹配分数
    const scoredTags = question.knowledgeTags.map(qt => ({
      qt,
      tag: qt.knowledgeTag,
      score: calculateTagScore(question.content, qt.knowledgeTag)
    }));

    // 按分数排序，分数相同则level高的优先
    scoredTags.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.tag.level - a.tag.level;
    });

    const topMatch = scoredTags[0];

    if (!topMatch || topMatch.score === 0) {
      const deleteIds = question.knowledgeTags.map(qt => qt.knowledgeTagId);
      if (deleteIds.length > 0) {
        await prisma.questionKnowledgeTag.deleteMany({
          where: {
            questionId: question.id,
            knowledgeTagId: { in: deleteIds },
          },
        });
      }
      console.log(`✓ [${question.id}] 清空标签（无匹配）`);
      console.log(`  题干: ${question.content.substring(0, 40)}...`);
      updatedCount++;
      continue;
    }

    const validTagIds = getTagAndParentIds(topMatch.tag);

    const validIds = new Set(validTagIds);
    const toDelete = question.knowledgeTags.filter(qt => !validIds.has(qt.knowledgeTagId));

    if (toDelete.length > 0) {
      await prisma.questionKnowledgeTag.deleteMany({
        where: {
          questionId: question.id,
          knowledgeTagId: { in: toDelete.map(qt => qt.knowledgeTagId) },
        },
      });
      console.log(`✓ [${question.id}] 更新标签`);
      console.log(`  题干: ${question.content.substring(0, 40)}...`);
      console.log(`  最佳匹配: ${topMatch.tag.name} (分数: ${topMatch.score})`);
      console.log(`  路径: ${getTagPath(topMatch.tag)}`);
      console.log(`  删除 ${toDelete.length} 个多余标签`);
      updatedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n完成！共更新 ${updatedCount} 道题目，跳过 ${skippedCount} 道题目`);
}

main()
  .catch((e) => {
    console.error('执行出错:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
