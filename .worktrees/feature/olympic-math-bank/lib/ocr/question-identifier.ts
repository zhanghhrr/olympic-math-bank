/**
 * 混合题目识别器
 * 智能识别和分割 OCR 输出的题目内容，区分单题/列表/忽略块
 */

export interface IdentifiedBlock {
  type: 'single_question' | 'list_container' | 'ignore' | 'unknown';
  content: string;
  answer?: string;
  header?: string;
  hasAnswer: boolean;
  hasImage: boolean;
}

// 题目类型 - 限定为四类
export type QuestionType = '填空题' | '选择题' | '解答题' | '计算题';

export interface ParsedQuestion {
  title?: string;
  content: string;
  answer?: string;
  analysis?: string;
  type?: QuestionType;
  difficulty?: number;
  hasImage?: boolean;
  formulas?: string;
  sourceBlocks?: string;
}

export type { ParsedQuestion as ParsedQuestionType };

export class HybridQuestionIdentifier {
  // 题目关键词
  private questionKeywords = [
    '例题', '练一练', '乘风破浪', '题目', '小试', '挑战',
    '口算', '脱式计算', '解方程', '牛刀', '真题', '练习', '进门考',
    '计算', '算一算', '解答题', '典型例题', '典型例', '例',
    '小测', '测试', '试卷', '复习', '期末', '期中', '单元', '练习卷'
  ];

  // 答案关键词 - 扩展更多格式
  private answerKeywords = [
    '答案', '解析', '解答', '解：', '解:', '【答案】', '【解析】', '【标注】',
    '答:', '答：', '解', '解析：', '解答：', '参考答案', '参考解析',
    '【解答】', '【解】', '【参考答案】', '【参考解析】'
  ];

  // 忽略关键词
  private ignoreKeywords = [
    '学习目标', '厉兵秣马', '数学视野', '庖丁解牛', '故事', '知识卡片'
  ];

  // 序号匹配: "1.", "1、", "(1)", "①", "【例1】", "一、", "(一)" 等
  private numberPattern = /^\s*(?:[-–—]\s*)?(\d+[\.．、]|[(（]\s*\d+\s*[)）]|[①-⑩]|[ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]+[\.．、]|【.*?\d+.*?】|第\s*\d+\s*题|[一二三四五六七八九十]+[、．\.]|[(（]\s*[一二三四五六七八九十]+\s*[)）])/;

  // 列表分割匹配
  private listPattern = /^\s*(?:[-–—]\s*)?(\d+[\.．、]|[(（]\s*\d+\s*[)）]|[一二三四五六七八九十]+[、．\.]|[(（]\s*[一二三四五六七八九十]+\s*[)）]|[①-⑩]|[ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]+[\.．、])\s*/;

  // 图片匹配
  private imagePattern = /!\[.*?\]\(.*?\)|<img.*?>/;

  // 标题匹配 (#, ##, ###)
  private headerPattern = /^(#{1,6})\s+(.*)/;

  /**
   * 判断是否是题目标题
   */
  isQuestionHeader(text: string): boolean {
    // 包含题目关键词
    for (const k of this.questionKeywords) {
      if (text.includes(k)) return true;
    }
    // 或者以数字序号开头
    if (this.numberPattern.test(text.trim())) return true;
    // 或者包含明显的答案标识符
    if (['【答案】', '【解析】', '【解答】'].some(marker => text.includes(marker))) {
      return true;
    }
    return false;
  }

  /**
   * 判断是否是忽略的标题
   */
  isIgnoreHeader(text: string): boolean {
    for (const k of this.ignoreKeywords) {
      if (text.includes(k)) return true;
    }
    return false;
  }

  /**
   * 判断是否包含答案关键词
   */
  hasAnswerKeyword(text: string): boolean {
    for (const k of this.answerKeywords) {
      if (text.includes(k)) return true;
    }
    return false;
  }

  /**
   * 判断是否包含图片
   */
  hasImage(text: string): boolean {
    return this.imagePattern.test(text);
  }

  /**
   * 尝试分离单题块中的题目和答案
   * 返回 [question, answer]
   */
  private splitQAInBlock(content: string): [string, string] {
    const ansMarkers = ['【答案】', '答案：', '答案:', '解析：', '解析:', '【解析】'];
    let splitPos = -1;

    for (const marker of ansMarkers) {
      const pos = content.indexOf(marker);
      if (pos !== -1) {
        if (splitPos === -1 || pos < splitPos) {
          splitPos = pos;
        }
      }
    }

    if (splitPos !== -1) {
      const qPart = content.substring(0, splitPos).trim();
      const aPart = content.substring(splitPos).trim();
      return [qPart, aPart];
    }

    return [content, ''];
  }

  /**
   * 在答案部分中检测是否包含新的题目
   * 处理【标注】后紧跟新题的情况
   */
  private splitQuestionsInAnswer(answerPart: string): Array<{content: string; answer?: string}> {
    const questions: Array<{content: string; answer?: string}> = [];

    // 按行分割
    const lines = answerPart.split('\n');
    let currentQuestion: string[] = [];
    let currentAnswer: string[] = [];
    let inAnswer = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 检测是否是新题目开始（以序号开头）
      const isNewQuestion = this.listPattern.test(line) &&
        !line.startsWith('【') &&
        !line.startsWith('(') &&
        !line.match(/^\d+[\.．、]\s*原式/); // 排除 "(1) 原式" 这种答案格式

      if (isNewQuestion && currentQuestion.length > 0) {
        // 保存之前的题目
        questions.push({
          content: currentQuestion.join('\n').trim(),
          answer: currentAnswer.join('\n').trim() || undefined
        });
        currentQuestion = [line];
        currentAnswer = [];
        inAnswer = false;
      } else if (line.startsWith('【答案】') || (line.match(/^\(\d+\)/) && inAnswer === false && currentQuestion.length > 0)) {
        // 进入答案部分
        inAnswer = true;
        currentAnswer.push(line);
      } else if (inAnswer) {
        currentAnswer.push(line);
      } else {
        currentQuestion.push(line);
      }
    }

    // 保存最后一个题目
    if (currentQuestion.length > 0) {
      questions.push({
        content: currentQuestion.join('\n').trim(),
        answer: currentAnswer.join('\n').trim() || undefined
      });
    }

    return questions;
  }

  /**
   * 检测内容是否像是一个题目列表
   * 改进：答案/解析区域内的编号行不参与计数，防止教师版解析子步骤被误判为独立题目
   */
  private isLikelyQuestionList(content: string, blockType: string = 'unknown'): boolean {
    const lines = content.split('\n');
    let numStartCount = 0;
    let ansMarkerCount = 0;
    const stylesFound = new Set<string>();

    // 找到第一个答案/解析标记的位置，之后的内容为"答案区"
    let answerZoneStart = -1;
    for (let i = 0; i < lines.length; i++) {
      if (this.hasAnswerKeyword(lines[i])) {
        answerZoneStart = i;
        // 只统计第一个答案标记（题干区），答案区内的标记不参与计数
        ansMarkerCount = 1;
        break;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const lineStripped = lines[i].trim();

      // 答案区内的编号行不参与计数（这些是解析子步骤）
      if (answerZoneStart >= 0 && i > answerZoneStart) {
        // 答案区内仍检测答案标记（用于判断是否为多题列表）
        if (this.hasAnswerKeyword(lineStripped)) {
          ansMarkerCount++;
        }
        continue;
      }

      const match = this.listPattern.exec(lineStripped);
      if (match) {
        numStartCount++;
        stylesFound.add(this.getNumberingType(match[1]));
      }
    }

    // 1. 没有序号开头，肯定不是列表
    if (numStartCount === 0) return false;

    // 2. 如果当前块已经被标识为"典型例题"，应极力避免按子题拆分
    if (blockType === 'single_question') {
      const majorStyles = new Set(['CHINESE_NUM', 'ARABIC_DOT']);
      let majorCount = 0;
      for (const line of lines) {
        const m = this.listPattern.exec(line.trim());
        if (m && majorStyles.has(this.getNumberingType(m[1]))) {
          majorCount++;
        }
      }
      if (majorCount >= 3) return true;
      return false;
    }

    // 3. 如果包含至少2个明显的答案标记，认为是列表
    if (ansMarkerCount >= 2) {
      if (stylesFound.size === 1 && stylesFound.has('SMALL_NUM') && ansMarkerCount <= 2) {
        return false;
      }
      if (stylesFound.size === 1 && stylesFound.has('SMALL_NUM') && ansMarkerCount <= 3) {
        return false;
      }
      return true;
    }

    // 4. 如果只有一个或零个答案标记
    if (ansMarkerCount <= 1) {
      if (stylesFound.size === 1 && stylesFound.has('SMALL_NUM')) {
        return false;
      }
      const majorStyles = new Set(['CHINESE_NUM', 'ARABIC_DOT']);
      let majorCount = 0;
      for (const line of lines) {
        const m = this.listPattern.exec(line.trim());
        if (m && majorStyles.has(this.getNumberingType(m[1]))) {
          majorCount++;
        }
      }
      if (majorCount >= 2) return true;
    }

    return false;
  }

  /**
   * 主分割方法
   * 混合分割策略:
   * 1. 尝试使用 Markdown 标题 (#) 进行结构化分割
   * 2. 如果结构化分割失败，回退到旧的关键词分割
   */
  splitContent(content: string): IdentifiedBlock[] {
    // 预处理：合并题号单独一行的情况（必须在最前面处理）
    const preprocessedContent = this.mergeQuestionNumbers(content);

    // 尝试标题分割
    const structureBlocks = this.splitByHeaders(preprocessedContent);

    // 统计有效块
    const finalBlocks: IdentifiedBlock[] = [];

    for (const block of structureBlocks) {
      // 关键修复：只要内容看起来像题目列表，强制转为 list_container
      if (this.isLikelyQuestionList(block.content, block.type)) {
        block.type = 'list_container';
      }

      if (block.type === 'ignore') continue;
      else if (block.type === 'list_container') {
        // 需要内部再切分
        const subBlocks = this.splitListBlock(block.content);
        finalBlocks.push(...subBlocks);
      } else if (block.type === 'unknown') {
        // 对 unknown 块尝试用关键词分割
        if (this.isLikelyQuestionList(block.content)) {
          const subBlocks = this.splitListBlock(block.content);
          finalBlocks.push(...subBlocks);
        } else {
          const [q, a] = this.splitQAInBlock(block.content);
          if (a || this.hasAnswerKeyword(block.content)) {
            block.content = q;
            block.answer = a;
            block.hasImage = this.hasImage(q) || this.hasImage(a);
            block.hasAnswer = true;
            finalBlocks.push(block);
          }
        }
      } else {
        // 单题块
        const [q, a] = this.splitQAInBlock(block.content);
        block.content = q;
        block.answer = a;
        block.hasImage = this.hasImage(q) || this.hasImage(a);
        block.hasAnswer = !!(a) || this.hasAnswerKeyword(block.content);

        // 关键过滤：如果没有答案，但内容看起来像题目，保留它
        // 刷题课中有些题目可能没有标准答案格式，但仍应保留
        if (!block.hasAnswer) {
          // 检查是否包含题号或明显的题目特征
          const hasQuestionNumber = /^\s*(?:[-–—]\s+)?\d+[\.．、]/.test(block.content);
          const hasQuestionKeyword = /计算|求|问|多少|几|是/.test(block.content);
          const isLongEnough = block.content.length > 20;

          if (hasQuestionNumber && hasQuestionKeyword && isLongEnough) {
            // 保留这个题目，即使没有明确答案
            block.hasAnswer = true;
          } else {
            continue;
          }
        }

        // 检查答案部分是否包含新的题目（【标注】后紧跟新题的情况）
        if (a && a.includes('【标注】')) {
          const subQuestions = this.splitQuestionsInAnswer(a);
          if (subQuestions.length > 1) {
            // 第一个是当前题目的答案（不含标注后的内容）
            const firstAnsEnd = a.indexOf('【标注】');
            block.answer = a.substring(0, firstAnsEnd).trim();
            finalBlocks.push(block);

            // 后续的是新题目
            for (let i = 1; i < subQuestions.length; i++) {
              const sq = subQuestions[i];
              finalBlocks.push({
                type: 'single_question',
                content: sq.content,
                answer: sq.answer,
                hasAnswer: !!(sq.answer),
                hasImage: this.hasImage(sq.content) || this.hasImage(sq.answer || '')
              });
            }
            continue;
          }
        }

        finalBlocks.push(block);
      }
    }

    // 如果最终提取到的块太少，尝试回退
    if (finalBlocks.length === 0 || finalBlocks.length < 2) {
      console.log('⚠️ 结构化分割产出块太少，回退到关键词分割模式...');
      return this.splitByKeywordsLegacy(content);
    }

    return finalBlocks;
  }

  /**
   * 判断是否是章节大标题（如 "(三) 大数计算"）
   */
  private isSectionHeader(text: string): boolean {
    // 匹配模式：(三)、（三）、三、 后面跟着2-8个汉字的标题
    const sectionPattern = /^[(（]?[一二三四五六七八九十]+[)）]?、?\s*[\u4e00-\u9fa5]{2,8}$/;
    return sectionPattern.test(text.trim());
  }

  /**
   * 按 Markdown 标题分割
   */
  private splitByHeaders(content: string): IdentifiedBlock[] {
    const lines = content.split('\n');
    const blocks: IdentifiedBlock[] = [];
    let currentBlock: {
      type: string;
      content: string[];
      header: string;
    } = { type: 'unknown', content: [], header: '' };
    let lastQuestionNumber = 0; // 追踪最后一个已确认的题号，用于连续性判断

    for (const line of lines) {
      const lineStripped = line.trim();
      const headerMatch = this.headerPattern.exec(lineStripped);

      if (headerMatch) {
        const headerText = headerMatch[2];

        // 如果标题是章节大标题（如 "## 一、奇偶性"），
        // 不应标记为 ignore，因为其下包含多道题目。
        // 改为通过 isQuestionHeader 正常分类，由 isLikelyQuestionList 兜底转为 list_container。
        const isSection = this.isSectionHeader(headerText);

        // 如果标题包含答案关键词，且当前正在处理题目，则认为该标题是题目的一部分
        if (this.hasAnswerKeyword(headerText) &&
            (currentBlock.type === 'single_question' || currentBlock.type === 'list_container')) {
          currentBlock.content.push(line);
          continue;
        }

        // 保存旧块
        if (currentBlock.content.length > 0) {
          const contentStr = currentBlock.content.join('\n').trim();
          if (contentStr) {
            const isPureHeader = currentBlock.content.length === 1;
            const hasQ = this.isQuestionHeader(contentStr);
            const hasA = this.hasAnswerKeyword(contentStr);

            if (isPureHeader && !(hasQ || hasA)) {
              if (currentBlock.type === 'single_question') {
                currentBlock.type = 'ignore';
              }
            }

            if (currentBlock.type === 'single_question' || currentBlock.type === 'list_container') {
              lastQuestionNumber = this.updateLastQuestionNumber(contentStr, lastQuestionNumber);
            }

            blocks.push({
              type: currentBlock.type as any,
              content: contentStr,
              header: currentBlock.header,
              hasAnswer: false,
              hasImage: false
            });
          }
        }

        // 开始新块
        let blockType = 'unknown';
        if (isSection) {
          // 章节标题（如 "一、奇偶性"）下方包含多道题目，直接归类为列表容器
          blockType = 'list_container';
        } else if (this.isQuestionHeader(headerText)) {
          if (['练习', '真题', '测试', '进门考', '挑战'].some(k => headerText.includes(k))) {
            blockType = 'list_container';
          } else {
            blockType = 'single_question';
          }
        } else if (this.isIgnoreHeader(headerText)) {
          if (this.hasAnswerKeyword(headerText)) {
            blockType = 'single_question';
          } else {
            blockType = 'single_question';
          }
        } else {
          if (this.hasAnswerKeyword(headerText)) {
            blockType = 'single_question';
          } else {
            blockType = 'ignore';
          }
        }

        currentBlock = {
          type: blockType,
          content: [line],
          header: headerText
        };
      } else {
        const isNumStart = this.numberPattern.test(lineStripped);
        // 仅将「数字+点号」视为主题目分界，避免数据行（如 14052、）被误判
        const isMainQuestionNum = /^\s*(?:[-–—]\s*)?\d+[\.．]/.test(lineStripped);
        const curContent = currentBlock.content.join('\n');
        const hasAns = this.hasAnswerKeyword(curContent);

        if (isMainQuestionNum && hasAns && currentBlock.content.length > 0 &&
            currentBlock.type !== 'ignore') {
          // 利用题号连续性判断是否为真正的下一题：
          // - 题号 = 当前块题号 + 1：连续，很大概率是新题目
          // - 题号 = 1：重启编号，大概率是答案子步骤
          // - 其他情况：用 isAnswerSubStepLine 兜底
          const currentNum = this.extractQuestionNumber(lineStripped);
          // 使用当前块内题号作为参考（比 lastQuestionNumber 更准确，因为当前块可能尚未 flush）
          const currentBlockNum = this.extractQuestionNumber(currentBlock.content[0] || '');
          const effectiveLastNumber = currentBlockNum > 0 ? currentBlockNum : lastQuestionNumber;
          const isConsecutive = currentNum > 0 && currentNum === effectiveLastNumber + 1;
          const isRestart = currentNum === 1 && effectiveLastNumber > 0;
          
          if (isConsecutive) {
            // 题号连续 → 确认为新题目，正常拆分
          } else if (isRestart) {
            // 答案区内的重启编号 → 子步骤，不拆分
            currentBlock.content.push(line);
            continue;
          } else {
            // 非连续非重启 → 用原有启发式检查
            const isSubStep = this.isAnswerSubStepLine(lineStripped, curContent);
            if (isSubStep) {
              currentBlock.content.push(line);
              continue;
            }
          }
          const contentStr = curContent.trim();
          if (contentStr) {
            // 提取当前块的题号，更新 lastQuestionNumber
            const blockNum = this.extractQuestionNumber(currentBlock.content[0] || '');
            if (blockNum > 0) lastQuestionNumber = blockNum;
            blocks.push({
              type: currentBlock.type as any,
              content: contentStr,
              header: currentBlock.header,
              hasAnswer: false,
              hasImage: false
            });
          }
          currentBlock = {
            type: 'single_question',
            content: [line],
            header: currentBlock.header
          };
        } else {
          currentBlock.content.push(line);
        }
      }
    }

    // 保存最后一个块
    if (currentBlock.content.length > 0) {
      const contentStr = currentBlock.content.join('\n').trim();
      if (contentStr) {
        if (currentBlock.type === 'single_question' || currentBlock.type === 'list_container') {
          lastQuestionNumber = this.updateLastQuestionNumber(contentStr, lastQuestionNumber);
        }
        blocks.push({
          type: currentBlock.type as any,
          content: contentStr,
          header: currentBlock.header,
          hasAnswer: false,
          hasImage: false
        });
      }
    }

    // 统计有效块
    const validCount = blocks.filter(b => b.type !== 'unknown').length;
    if (validCount === 0) return [];

    return blocks;
  }

  /**
   * 判断当前编号行是否是答案/解析区域内的子步骤（不应作为新题目拆分）
   * 教师版 PDF 中，解析部分常包含编号子步骤，如：
   *   【解析】
   *   1. 先计算...
   *   2. 再计算...
   *   3. 最终得出...
   * 这些子步骤的编号不应被误判为新题目的开始。
   */
  private isAnswerSubStepLine(currentLine: string, blockContent: string): boolean {
    // 获取答案/解析标记之后的内容
    const ansMarkerPos = this.findLastAnswerMarkerPos(blockContent);
    if (ansMarkerPos < 0) return false;

    const afterAnswer = blockContent.substring(ansMarkerPos);

    // 条件1：答案/解析区已包含编号子步骤（说明当前块正在列举步骤）
    const subStepCount = (afterAnswer.match(/\n\s*(?:\d+[\.．、]|[(（]\s*\d+\s*[)）])/g) || []).length;
    if (subStepCount >= 0) {
      // 当前行编号较小（≤5），且内容不包含新题目的典型特征
      const numMatch = currentLine.match(/^\s*(?:[-–—]\s*)?(\d+)[\.．、]/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        // 编号为 1-5 的且不包含题目关键词的，大概率是子步骤
        if (num <= 5 && !this.hasQuestionContentSignals(currentLine)) {
          return true;
        }
      }
    }

    // 条件2：答案区末尾行不是典型的"答案结束"标记（如空行、分隔符）
    const afterAnswerLines = afterAnswer.split('\n').filter(l => l.trim());
    if (afterAnswerLines.length > 0) {
      const lastLine = afterAnswerLines[afterAnswerLines.length - 1].trim();
      // 如果答案区最后一行以计算符号结尾（=、+、-、×、÷），说明还在解析中
      if (/[=+\-×÷>]\s*$/.test(lastLine)) return true;
      // 如果最后一行是短数字，可能是中间计算结果
      if (/^\d+(\.\d+)?$/.test(lastLine) && lastLine.length <= 10) return true;
    }

    return false;
  }

  /**
   * 查找内容中最后一个答案/解析标记的位置
   */
  private findLastAnswerMarkerPos(content: string): number {
    let lastPos = -1;
    for (const marker of this.answerKeywords) {
      const pos = content.lastIndexOf(marker);
      if (pos > lastPos) lastPos = pos;
    }
    return lastPos;
  }

  /**
   * 检查行内容是否包含典型题目信号（问句、计算关键词等）
   */
  private hasQuestionContentSignals(line: string): boolean {
    return /[？?]|多少|几[个种]|计算|求|问|填[空写]|选择/.test(line);
  }

  /**
   * 从行首提取出题号数字（仅匹配 数字+点号 格式）
   * 返回题号数字，若无法提取则返回 0
   */
  private extractQuestionNumber(line: string): number {
    const m = line.match(/^\s*(?:[-–—]\s*)?(\d+)[\.．]/);
    if (m) return parseInt(m[1]);
    return 0;
  }

  /**
   * 从块内容提取题号并更新 lastQuestionNumber
   */
  private updateLastQuestionNumber(content: string, lastNumber: number): number {
    const num = this.extractQuestionNumber(content);
    if (num > 0) return num;
    return lastNumber;
  }
  private getNumberingType(text: string): string {
    if (!text) return 'OTHER';

    // Chinese numerals
    if (/^[一二三四五六七八九十百]+[、\.]$/.test(text)) return 'CHINESE_NUM';
    if (/^[（(]\s*[一二三四五六七八九十百]+\s*[)）]$/.test(text)) return 'CHINESE_PAREN';

    if (/^\d+[.．、]$/.test(text)) return 'ARABIC_DOT';

    // Small nums
    if (/^[（(]\s*\d+\s*[)）]$/.test(text) || /^[①-⑩]$/.test(text) || /^[ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]+[\.．、]$/.test(text)) {
      return 'SMALL_NUM';
    }

    return 'OTHER';
  }

  /**
   * 预处理：合并题号单独一行的情况
   * 处理模式：
   *   6.
   *   右下图是聪聪...
   * 合并为：
   *   6. 右下图是聪聪...
   */
  private mergeQuestionNumbers(content: string): string {
    // 先统一换行符
    let normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 使用更简单的正则替换方法
    // 匹配模式：行首的数字+点，后面紧跟换行符，再跟非空行
    // 使用多行模式(m)和点号匹配所有字符(s)
    normalized = normalized.replace(
      /^(\s*(?:[-–—]\s+)?\d+[\.．、])\s*\n(?!\s*(?:[-–—]\s+)?\d+[\.．、]|\s*【|\s*!\[|\s*$)(.+)$/gm,
      '$1 $2'
    );

    return normalized;
  }

  /**
   * 对列表容器块进行二次分割
   * 改进：更好地处理连续题号，确保不遗漏题目
   * 关键修复：处理题号单独一行的情况（如 "6.\n" + "题目内容"）
   */
  private splitListBlock(content: string): IdentifiedBlock[] {
    // 预处理：合并题号单独一行的情况
    // 模式：行只包含题号（如 "6."、"8."），下一行是实际内容
    const preprocessedContent = this.mergeQuestionNumbers(content);
    const lines = preprocessedContent.split('\n');

    // 找到第一个答案/解析标记之后的内容为"答案区"，其内的编号行不作为分割点
    let answerZoneStart = -1;
    for (let i = 0; i < lines.length; i++) {
      if (this.hasAnswerKeyword(lines[i])) {
        answerZoneStart = i;
        break;
      }
    }

    // Pass 1: Determine types present and collect all separators with their line numbers
    const typesFound = new Set<string>();
    const separatorLines: Array<{ lineIndex: number; style: string; number: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      // 答案区内的编号行不作为分割点
      if (answerZoneStart >= 0 && i > answerZoneStart) continue;

      const lineStripped = lines[i].trim();
      const match = this.listPattern.exec(lineStripped);
      if (match) {
        const text = match[1];
        const style = this.getNumberingType(text);
        if (style !== 'OTHER') {
          typesFound.add(style);
          // 尝试提取序号数字
          const numMatch = text.match(/\d+/);
          const num = numMatch ? parseInt(numMatch[0]) : 0;
          separatorLines.push({ lineIndex: i, style, number: num });
        }
      }
    }

    // Determine target style based on priority
    let targetStyle: string | null = null;
    if (typesFound.has('ARABIC_DOT')) targetStyle = 'ARABIC_DOT';
    else if (typesFound.has('CHINESE_NUM')) targetStyle = 'CHINESE_NUM';
    else if (typesFound.has('CHINESE_PAREN')) targetStyle = 'CHINESE_PAREN';
    else if (typesFound.has('SMALL_NUM')) targetStyle = 'SMALL_NUM';

    // 如果没有找到目标样式，但有分隔符，使用第一个分隔符的样式
    if (!targetStyle && separatorLines.length > 0) {
      targetStyle = separatorLines[0].style;
    }

    const subBlocks: IdentifiedBlock[] = [];
    const currentSub: string[] = [];
    let introText = '';
    let isFirstChunk = true;
    let lastNumber = 0;
    let subStepMode = false; // 进入子步骤模式后，后续编号行不再作为分隔符

    const flushBlock = (linesList: string[], isFirst: boolean = false) => {
      if (linesList.length === 0) return;
      let text = linesList.join('\n').trim();
      if (!text) return;

      // 清洗内容，移除OCR残留
      text = this.cleanQuestionContent(text);
      if (!text) return;

      // 如果是第一块，且没有答案标记，通常是列表的引导词
      if (isFirst) {
        const [q, a] = this.splitQAInBlock(text);
        if (!a && !this.hasAnswerKeyword(text)) {
          introText = text;
          return;
        }
      }

      // 附加引导词
      if (introText) {
        text = introText + '\n' + text;
        introText = '';
      }

      const [q, a] = this.splitQAInBlock(text);
      const hasAns = !!(a) || this.hasAnswerKeyword(text);

      // 检查是否看起来像题目（有题号或题目特征）
      const hasQuestionNumber = /^\s*(?:[-–—]\s+)?\d+[\.．、]/.test(text);
      const hasQuestionKeyword = /计算|求|问|多少|几|是|个|填|选择/.test(text);
      const looksLikeQuestion = hasQuestionNumber || (hasQuestionKeyword && text.length > 15);

      // 保留有答案的题目，或者看起来像题目的内容
      if (hasAns || looksLikeQuestion) {
        subBlocks.push({
          content: q,
          answer: a,
          hasAnswer: hasAns,
          hasImage: this.hasImage(text),
          type: 'single_question'
        });
      }
    };

    // 改进的分割逻辑：使用记录的separator位置进行精确分割
    let currentSeparatorIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      // 答案区内的行不参与分割（直接追加到当前块）
      if (answerZoneStart >= 0 && i > answerZoneStart) {
        currentSub.push(lines[i]);
        continue;
      }

      const lineStripped = lines[i].trim();
      const match = this.listPattern.exec(lineStripped);
      let isSeparator = false;

      if (match) {
        const text = match[1];
        const style = this.getNumberingType(text);

        // 检查是否是目标样式的分隔符
        if (targetStyle && style === targetStyle) {
          const numMatch = text.match(/\d+/);
          const currentNumber = numMatch ? parseInt(numMatch[0]) : 0;

          // 题号连续性判断：
           // - 如果编号从 1 重启且上一题号 > 1：很可能是答案区子步骤，不拆分
           // - 进入子步骤模式后，后续编号行持续跳过，直到 flushBlock 重新开始
           // - 如果编号连续增长：正常新题目
           if (subStepMode) {
             isSeparator = false;
           } else if (lastNumber > 1 && currentNumber === 1 && answerZoneStart < 0) {
             // 重启编号且之前未检测到答案区 → 进入子步骤模式，不拆分
             isSeparator = false;
             subStepMode = true;
           } else {
             isSeparator = true;
             // 检测题号是否连续，如果不连续可能是遗漏了题目
             if (lastNumber > 0 && currentNumber > lastNumber + 1 && currentNumber <= lastNumber + 3) {
               console.log(`  [Warning] 题号不连续: ${lastNumber} -> ${currentNumber}，可能有遗漏`);
             }
             lastNumber = currentNumber;
           }
        }
      }

      if (isSeparator) {
        flushBlock(currentSub, isFirstChunk);
        isFirstChunk = false;
        currentSub.length = 0;
        currentSub.push(lines[i]);
        currentSeparatorIndex++;
      } else {
        currentSub.push(lines[i]);
      }
    }

    flushBlock(currentSub, isFirstChunk);

    // 后处理：检查是否有明显的遗漏（题号跳跃）
    this.checkForMissingQuestions(subBlocks);

    return subBlocks;
  }

  /**
   * 检查是否有遗漏的题目（通过分析题号连续性）
   */
  private checkForMissingQuestions(blocks: IdentifiedBlock[]): void {
    const numbers: number[] = [];

    for (const block of blocks) {
      const match = block.content.match(/^\s*(?:[-–—]\s+)?(\d+)[\.．、]/);
      if (match) {
        numbers.push(parseInt(match[1]));
      }
    }

    if (numbers.length >= 2) {
      for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] > numbers[i - 1] + 1) {
          console.log(`  [Warning] 检测到题号跳跃: ${numbers[i - 1]} -> ${numbers[i]}，可能有遗漏题目`);
        }
      }
    }
  }

  /**
   * 基于关键词和逻辑分割内容为题目块（旧逻辑）
   */
  private splitByKeywordsLegacy(content: string): IdentifiedBlock[] {
    const lines = content.split('\n');
    const blocks: IdentifiedBlock[] = [];
    const currentBlockLines: string[] = [];
    let currentHasAnswer = false;

    const flushLegacyBlock = (linesList: string[], hasAns: boolean) => {
      if (linesList.length === 0) return;
      const text = linesList.join('\n').trim();
      if (!text) return;

      const [q, a] = this.splitQAInBlock(text);
      const finalHasAns = !!(a) || hasAns;

      if (!q || q.length < 2) return;

      blocks.push({
        content: q,
        answer: a || undefined,
        hasAnswer: finalHasAns,
        hasImage: this.hasImage(text),
        type: 'single_question'
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStripped = line.trim();
      if (!lineStripped) continue;

      const isQKeyword = this.isQuestionHeader(lineStripped);
      const isNumStart = this.numberPattern.test(lineStripped);
      const isAnswerHeader = this.hasAnswerKeyword(lineStripped) && isQKeyword;

      let startNew = false;

      if (isAnswerHeader && currentBlockLines.length > 0) {
        currentBlockLines.push(lineStripped);
        currentHasAnswer = true;
        continue;
      }

      if (isQKeyword) {
        startNew = true;
      } else if (isNumStart) {
        if (currentHasAnswer) {
          startNew = true;
        } else if (currentBlockLines.length === 0) {
          startNew = true;
        }
      }

      if (startNew && currentBlockLines.length > 0) {
        flushLegacyBlock(currentBlockLines, currentHasAnswer);
        currentBlockLines.length = 0;
        currentHasAnswer = false;
      }

      currentBlockLines.push(line);

      if (this.hasAnswerKeyword(lineStripped)) {
        currentHasAnswer = true;
      }
    }

    flushLegacyBlock(currentBlockLines, currentHasAnswer);

    return blocks;
  }

  /**
   * 将中文题型映射为 Prisma 数据库枚举值
   */
  static questionTypeToDB(type: '填空题' | '选择题' | '解答题' | '计算题'): 'FILL_BLANK' | 'CHOICE' | 'SOLUTION' | 'CALCULATION' {
    const map: Record<string, 'FILL_BLANK' | 'CHOICE' | 'SOLUTION' | 'CALCULATION'> = {
      '填空题': 'FILL_BLANK',
      '选择题': 'CHOICE',
      '解答题': 'SOLUTION',
      '计算题': 'CALCULATION',
    };
    return map[type] || 'SOLUTION';
  }

  /**
   * 章节标题模式 - 用于过滤大标题混入题目的情况
   * 匹配：(三)、（三）、三、 后面跟着2-8个汉字，可选以"计算/应用/几何"等结尾
   */
  private sectionHeaderPattern = /^[(（]?[一二三四五六七八九十]+[)）]?、?\s*[\u4e00-\u9fa5]{2,8}(?:计算|应用|几何|计数|数论|杂题|专题|部分)?/;

  /**
   * 清洗题目内容，移除 OCR 残留和异常字符
   * 处理策略：
   * 1. 移除行首的重复数字残留（如 "345345345345 2." -> "2."）
   * 2. 移除孤立的数字串（连续6位以上数字，不在公式中）
   * 3. 过滤章节大标题（如 "(三) 大数计算"）
   * 4. 清理多余的空行
   * 5. 修复重复识别的数字串
   */
  private cleanQuestionContent(content: string): string {
    let cleaned = content;

    // 策略0: 移除行首 ## 残留（标题分隔符遗留，包括独立标题行和"## 文字"）
    cleaned = cleaned.replace(/^#{1,6}[ \t]*.*$/gm, '');

    // 策略0.5: 移除 markdown 列表前缀（如 "- 1．" -> "1．"）
    cleaned = cleaned.replace(/^\s*[-–—]\s+(?=\d+[\.．、]|[(（]\s*\d+\s*[)）]|[①-⑩]|[一二三四五六七八九十]+[、．\.])/gm, '');

    // 策略1: 移除行首的重复数字残留（数字串后跟序号的情况）
    // 匹配行首的连续数字（6位以上），后面跟着序号
    cleaned = cleaned.replace(/^(\d{6,})\s+(\d+[\.．、]|[(（]\s*\d+\s*[)）])/gm, '$2');

    // 策略1.5: 修复重复数字模式（如 "345345345345" 这种重复3-4次的数字）
    // 检测重复3次以上的短数字串（3-5位数字重复）
    cleaned = cleaned.replace(/(\d{3,5})\1{2,}/g, '');

    // 策略1.6: 移除行内孤立的超长重复数字串
    cleaned = cleaned.replace(/\b\d{9,}\b/g, '');

    // 策略2: 移除孤立的超长数字串（不在 LaTeX 公式中）
    // 只处理不在 $...$ 或 \(...\) 中的纯数字串（8位以上）
    const lines = cleaned.split('\n');
    const processedLines = lines.map(line => {
      // 如果行包含 LaTeX 公式，谨慎处理
      if (line.includes('$') || line.includes('\\(') || line.includes('\\[')) {
        return line;
      }
      // 移除行首或行尾的孤立长数字串
      return line.replace(/^\d{6,}\s+|\s+\d{6,}$/g, '');
    });
    cleaned = processedLines.join('\n');

    // 策略3: 过滤章节大标题
    // 处理两种情况：
    // 1. 章节标题单独一行
    // 2. 章节标题和题目在同一行（如 "## (三) 大数计算 16. 计算：..."）

    // 首先处理章节标题和题目在同一行的情况
    // 模式：Markdown标题标记 + 章节标题 + 题号
    const combinedPattern = /^(#{1,6}\s*)?[(（]?[一二三四五六七八九十]+[)）]?、?\s*[\u4e00-\u9fa5]{2,8}(?:计算|应用|几何|计数|数论|杂题|专题|部分)?\s*(\d+[\.．、])/gm;
    cleaned = cleaned.replace(combinedPattern, '$1$2');

    // 然后处理单独的章节标题行
    const lines2 = cleaned.split('\n');
    const filteredLines: string[] = [];
    let skipSectionHeader = true;

    for (const line of lines2) {
      const trimmedLine = line.trim();

      // 检测是否是纯章节标题行（不包含题号）
      const isPureSectionHeader = this.sectionHeaderPattern.test(trimmedLine) &&
                                   !this.numberPattern.test(trimmedLine) &&
                                   trimmedLine.length < 20;

      // 如果是开头的章节标题，跳过
      if (skipSectionHeader && isPureSectionHeader) {
        continue;
      }

      // 一旦遇到有效内容（题号或题目关键词），停止跳过
      if (skipSectionHeader && (this.numberPattern.test(trimmedLine) || this.isQuestionHeader(trimmedLine))) {
        skipSectionHeader = false;
      }

      // 过滤掉单独的章节标题行（在中间出现的情况）
      if (isPureSectionHeader) {
        continue;
      }

      filteredLines.push(line);
    }
    cleaned = filteredLines.join('\n');

    // 策略4: 清理多余空行
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // 策略5: 清理行首行尾的空格
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');

    // 策略6: 合并 OCR 导致的断行
    // 如果某行不以句末标点结束（。？！…；：，,)】"），且下一行非空，
    // 且下一行不以题号/选项字母开头，则合并为一行
    cleaned = this.mergeOcrBrokenLines(cleaned);

    // 策略6.5: 推断填空占位符 — OCR 丢失了下划线，在「空格 + 量词」处插入 ______
    // 例："相距 米." → "相距______米."  "是 米/分，" → "是______米/分，"
    cleaned = this.inferBlankPlaceholders(cleaned);

    // 策略6.7: 将 Markdown 转义下划线 \_ 还原为填空占位符 ______
    // 连续2个以上 \_ 是多重空格（如 \_\_\_\_ → ______）
    cleaned = cleaned.replace(/(?:\\_){2,}/g, '______');
    // 单独的 \_$ 后跟量词单位（°、度、米 等）→ 单格填空（如 \_$ ° → ______$ °）
    cleaned = cleaned.replace(/\\_\$(?=\s*[°\u4e00-\u9fa5\d])/g, '______$$');

    // 策略7: 清理中文文本中多余的词间空格
    // 中文之间不应有空格："相向出 发" → "相向出发"
    cleaned = cleaned.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');

    // 策略8: 合并多余空行（再次执行，因为合并断行可能产生新空行）
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  }

  /**
   * 合并 OCR 导致的非语义断行
   * 规则：
   * 1. 若某行不以句末标点（。？！…；：，)】"）结束
   * 2. 且下一行非空
   * 3. 且下一行不以题号/选项字母/中文序号开头
   * → 合并两行
   */
  private mergeOcrBrokenLines(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    const sentenceEnd = /[。？！…；：，)）】"』\w]$/;
    const newLineStart = /^\s*(?:\d+[\.．、]|[-–—]\s*\d|[(（]\s*\d|第\s*\d|[一二三四五六七八九十]+[、．\.]|[A-D][\.．、])/;
    // 不应合并的行：代码围栏、分隔线、空行、纯数字、孤立标记
    const skipMergeLine = /^\s*(?:```|[-*_]{3,}|={3,}|\*{2,}|\d+$|#)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        result.push(line);
        continue;
      }
      if (i + 1 < lines.length && lines[i + 1].trim()
          && !sentenceEnd.test(line.trim())
          && !newLineStart.test(lines[i + 1])
          && !skipMergeLine.test(lines[i + 1])
          && !skipMergeLine.test(line)) {
        result.push(line + lines[i + 1]);
        i++;
      } else {
        result.push(line);
      }
    }
    return result.join('\n');
  }

  /**
   * 推断填空占位符 — 当 OCR 丢失下划线时，在语义上应填入数值的位置插入 ______
   *
   * 启发式规则：
   *   空格前是"相距/是/为/需要/共/长/宽/高"等预期后接数值的词
   *   空格后是量词（米、千米、米/分、分钟、元、个 等）
   *   空格前没有数字（排除 "走45 米" 这种普通排版空格）
   *
   * 例：
   *   "相距 米。"     → "相距______米。"
   *   "是 米/分，"    → "是______米/分，"
   *   "需要 分钟到达" → "需要______分钟到达"
   */
  private inferBlankPlaceholders(text: string): string {
    const indicatorRe = /(相距|是|[速度长宽高共计需]为?|共[有计]?|需要?|[长宽高][度为]?)/;
     const unitRe = /[米千米厘米分米毫米秒分时天元个克千克吨][\/每]*(?:分|秒|时|米|千米|厘米)?/;

    return text.replace(
      new RegExp(
        `(${indicatorRe.source})\\s+(?=${unitRe.source}(?:[，,。.]|$))`,
        'g'
      ),
      '$1______'
    );
  }

  /**
   * 移除答案中的无关标签
   * 包括【标注】、【业务题型】等OCR残留
   */
  private removeUselessAnswerTags(answer: string): string {
    let cleaned = answer;

    // 移除图片标记 ![](...) 及其后面的所有内容
    cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '');
    cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '');

    // 移除【标注】及其后面的所有内容（支持换行）
    cleaned = cleaned.replace(/【标注】[\s\S]*$/, '');
    cleaned = cleaned.replace(/【标注】[\s\S]*/g, '');

    // 移除【业务题型】及其后面的所有内容
    cleaned = cleaned.replace(/【业务题型】[\s\S]*$/, '');
    cleaned = cleaned.replace(/【业务题型】[\s\S]*/g, '');

    // 移除【知识点】、【题型分类】等常见无关标签
    cleaned = cleaned.replace(/【知识点】[\s\S]*$/, '');
    cleaned = cleaned.replace(/【知识点】[\s\S]*/g, '');
    cleaned = cleaned.replace(/【题型分类】[\s\S]*$/, '');
    cleaned = cleaned.replace(/【题型分类】[\s\S]*/g, '');
    cleaned = cleaned.replace(/【参考】[\s\S]*$/, '');
    cleaned = cleaned.replace(/【参考】[\s\S]*/g, '');
    cleaned = cleaned.replace(/【思想】[\s\S]*$/, '');
    cleaned = cleaned.replace(/【思想】[\s\S]*/g, '');
    cleaned = cleaned.replace(/【能力】[\s\S]*$/, '');
    cleaned = cleaned.replace(/【能力】[\s\S]*/g, '');
    cleaned = cleaned.replace(/【解答】[\s\S]*$/, '');
    cleaned = cleaned.replace(/【解答】[\s\S]*/g, '');

    // 清理多余空行
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // 移除代码围栏标记：``` 和 ```language
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*$/gm, '');
    // 移除分隔线
    cleaned = cleaned.replace(/^[-\*_]{3,}\s*$/gm, '');
    // 移除孤立的 ** 标记
    cleaned = cleaned.replace(/^\s*\*{2,}\s*$/gm, '');

    return cleaned.trim();
  }

  /**
   * 根据题型清洗答案内容
   * - 填空题：只保留空里该填的内容（数字或简短答案）
   * - 选择题：只保留选项字母
   * - 解答题/计算题：只保留最简洁的答案
   */
  private cleanAnswerByType(answer: string, questionType: QuestionType): string {
    if (!answer) return '';

    let cleaned = answer.trim();

    // 根据题型进行特定处理
    if (questionType === '选择题') {
      // 选择题：只保留选项字母（A、B、C、D）
      // 先移除选项描述（如"A. 123" 只保留"A"）
      const optionMatch = cleaned.match(/^[A-D][\.、\s]?\s*(.+)/);
      if (optionMatch) {
        // 如果选项是一个简短内容，直接取选项字母
        cleaned = optionMatch[1].trim();
        // 检查是否是纯选项格式（如"A、B"或"A B C D"）
        if (/^[A-D][\.、\s][A-D][\.、\s]/.test(cleaned) || /^[A-D]\s+[A-D]\s+/.test(cleaned)) {
          // 多选项格式：提取所有选项字母
          const letters = cleaned.match(/[A-D]/g);
          if (letters) {
            return letters.join('');
          }
        }
      }
      // 直接提取字母
      const letters = cleaned.match(/[A-D]/g);
      if (letters && letters.length > 0) {
        // 如果只有一个字母，直接返回
        if (letters.length === 1) {
          return letters[0];
        }
        // 如果有多个字母，返回第一个（常见于单选题）
        return letters[0];
      }
      return cleaned;
    }

    if (questionType === '填空题') {
      // 填空题：只保留答案中的数值或简短内容
      // 常见格式：数字、分数、简单表达式
      // 取最后一部分（通常答案是放在最后的）
      const parts = cleaned.split(/\n/).filter(p => p.trim());
      if (parts.length > 0) {
        const lastPart = parts[parts.length - 1].trim();
        // 如果是纯数字或简单表达式，直接返回
        if (/^[\d\.\/\+\-\*\^\(\)]+$/.test(lastPart)) {
          return lastPart;
        }
        // 如果包含数字，尝试提取数字部分
        const numMatch = lastPart.match(/(\d+(?:\.\d+)?(?:\/\d+)?)/);
        if (numMatch) {
          return numMatch[1];
        }
        // 否则返回最后一行
        return lastPart;
      }
      return cleaned;
    }

    if (questionType === '解答题' || questionType === '计算题') {
      // 解答题/计算题：只保留最简洁的答案
      // 取第一行，去掉"解："、"答："等前缀
      const firstLine = cleaned.split(/\n/)[0].trim();
      const simplified = firstLine
        .replace(/^(解|答)[：:]\s*/, '')
        .replace(/^(原式|计算)[：:]\s*/, '')
        .trim();

      // 如果简化后为空或太短，返回原答案的第一行
      if (simplified.length > 0) {
        return simplified;
      }
      return firstLine.length > 0 ? firstLine : cleaned.substring(0, 50);
    }

    return cleaned;
  }

  /**
   * 将识别块转换为标准题目格式
   */
  convertToQuestions(blocks: IdentifiedBlock[]): ParsedQuestion[] {
    const questions: ParsedQuestion[] = [];
    let questionNumber = 1;

    for (const block of blocks) {
      if (!block.content || block.content.length < 5) continue;

      // 清洗内容，移除 OCR 残留
      const cleanedContent = this.cleanQuestionContent(block.content);
      if (cleanedContent.length < 5) continue;

      // 提取题目标题
      let title: string | undefined;

      // 尝试匹配题号+标题的格式
      const titleMatch = cleanedContent.match(/^(?:\d+[\.．、]|典型例题|牛刀小试)\s*(.+?)(?:\n|$)/);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      // 从答案中提取解析
      let analysis: string | undefined;
      let answer = block.answer ? this.cleanQuestionContent(block.answer) : undefined;

      if (answer) {
        // 先移除【标注】和【业务题型】等无关文本
        answer = this.removeUselessAnswerTags(answer);

        // 提取【解析】部分：匹配【解析】到下一个【...】标签之前的所有内容
        const analysisMatch = answer.match(/【解析】([\s\S]*?)(?=【|$)/);
        if (analysisMatch) {
          analysis = analysisMatch[1].trim();
          // 从答案中移除解析部分
          answer = answer.replace(/【解析】[\s\S]*?(?=【|$)/, '').trim();
        }
        // 移除答案标记
        answer = answer.replace(/^【答案】/, '').trim();

        // 用户需求：答案就是紧跟着【答案】之后的，在【解析】之前的文本
        // 不再根据题型进一步精简答案
      }

      // 确保内容以正确的题号开头
      let finalContent = cleanedContent;
      const hasNumberPrefix = /^\s*(?:[-–—]\s+)?\d+[\.．、]/.test(cleanedContent);
      if (!hasNumberPrefix && title) {
        // 如果没有题号但有标题，尝试添加题号
        finalContent = `${questionNumber}. ${cleanedContent}`;
      }

      // 检测题目类型
      const questionType = detectQuestionType(finalContent);

      questions.push({
        title,
        content: finalContent,
        answer,
        analysis,
        type: questionType,
        hasImage: block.hasImage
      });

      questionNumber++;
    }

    // 最后检查：如果题目数量明显偏少，输出警告
    if (blocks.length > 0 && questions.length < blocks.length * 0.5) {
      console.log(`  [Warning] 题目转换率较低: ${questions.length}/${blocks.length}，可能有内容被过滤`);
    }

    return questions;
  }
}

// 导出单例
export const questionIdentifier = new HybridQuestionIdentifier();

/**
 * 增强版题目类型检测（独立函数）
 *
 * 检测优先级（从高到低）：
 * 1. 计算题：含「计算/口算/脱式/竖式/递等式」等关键词（含填空符号则降为填空题）
 * 2. 选择题：含多行 A/B/C/D 选项标记，或「选择/选项」关键词
 * 3. 填空题：含下划线 ___、括号（）、方框 □、填空关键词、中文省略号…… 等情况
 * 4. 解答题：一切不匹配上述三类特征的题目（兜底）
 */
export function detectQuestionType(content: string): '填空题' | '选择题' | '解答题' | '计算题' {
  // ── 1. 计算题（优先级最高）─────────────────
  if (/计算|口算|脱式|竖式|简便计算|递等式|直接写得数/.test(content)) {
    // 如果同时有横线/括号填空，且无等号，则为填空形式的计算题
    if (/(_{3,}|[(（]\s*[)）]|\s*?)/.test(content) && !/=/.test(content)) {
      return '填空题';
    }
    return '计算题';
  }

  // ── 2. 选择题 ──────────────────────────────
  // 2a. 多行选项：至少3行的行首是 A/B/C/D + 分隔符
  const lines = content.split('\n');
  const choiceStartCount = lines.filter(l => /^\s*[A-D][\.．、：:\s)]/.test(l)).length;
  if (choiceStartCount >= 3) return '选择题';

  // 2b. 行内连续选项：A.xxx B.xxx C.xxx D.xxx
  if (/(?:^|\s)[A-D][\.．、]\s.+?(?:^|\s)[A-D][\.．、]\s.+?(?:^|\s)[A-D][\.．、]/m.test(content)) {
    return '选择题';
  }

  // 2c. 关键词 + 至少两个选项
  if (/选择[题項]|^选项\s/m.test(content)) return '选择题';

  // 2d. 内容中包含非单词边界的 A-D 选项标记（严格的上下文检测）
  // 排除作为单词一部分的情况（如 "Area", "BCD"）
  const strictChoiceRe = /(?:^|[\s,，。；;])([A-D])[\.．、：:]/gm;
  let choiceCount = 0;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = strictChoiceRe.exec(content)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); choiceCount++; }
  }
  if (choiceCount >= 3) return '选择题';

  // ── 3. 填空题 ──────────────────────────────
  // 3a. 关键词匹配
  if (/填空|填入|填写/.test(content)) return '填空题';

  // 3b. 空白占位符：下划线（2个以上）、方框、半角括号（）、中文省略号……
  if (/(_{2,}|[…]{2}|□|（\s*）)/.test(content)) return '填空题';

  // 3c. 题目末尾是问句 + 含空白特征（如「_____米」「是____」）
  if (/[？?]$/m.test(content)) {
    if (/_{2,}|（\s*）/.test(content)) return '填空题';
  }

  // 3d. LaTeX 公式中的空白占位符：\underline{\quad} 等
  if (/\\underline\{\\quad\}|\\fillin/.test(content)) return '填空题';

  // 3e. 推断填空：OCR丢失了下划线，但内容结构暗示为填空题
  // 特征：以陈述句/逗号结尾，且末尾量词前缺数字
  // 例："相距米。" → 应为"相距______米。"  "是米/分，" → 应为"是______米/分，"
  if (/[。.，,；;]$/m.test(content)) {
    const impliedBlankRe = /(?:相距|速度[是为]?|[是以为]|共[计行走了]?|需要|[长宽高][为度]?)\s*[米千米厘米分米毫米秒分时天元个克千克吨][\/\u6bcf]*(?:分|秒|时|米|千米|厘米)?[。.，,；;]?\s*$/m;
    if (impliedBlankRe.test(content)) return '填空题';
  }

  // ── 4. 解答题（兜底）──────────────────────
  return '解答题';
}
