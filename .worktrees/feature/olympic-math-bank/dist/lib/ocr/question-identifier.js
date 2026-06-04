"use strict";
/**
 * 混合题目识别器
 * 将 verify_general_lecture.py 中的 HybridQuestionIdentifier 转换为 TypeScript
 * 用于智能识别和分割题目内容
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.questionIdentifier = exports.HybridQuestionIdentifier = void 0;
class HybridQuestionIdentifier {
    constructor() {
        // 题目关键词
        this.questionKeywords = [
            '例题', '练一练', '乘风破浪', '题目', '小试', '挑战',
            '口算', '脱式计算', '解方程', '牛刀', '真题', '练习', '进门考',
            '计算', '算一算', '解答题', '典型例题', '典型例', '例'
        ];
        // 答案关键词
        this.answerKeywords = [
            '答案', '解析', '解答', '解：', '解:', '【答案】', '【解析】', '【标注】'
        ];
        // 忽略关键词
        this.ignoreKeywords = [
            '学习目标', '厉兵秣马', '数学视野', '庖丁解牛', '故事', '知识卡片'
        ];
        // 序号匹配: "1.", "1、", "(1)", "①", "【例1】", "一、", "(一)" 等
        this.numberPattern = /^\s*(\d+[\.、]|[(（]\s*\d+\s*[)）]|[①-⑩]|[ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]+[\.、]|【.*?\d+.*?】|第\s*\d+\s*题|[一二三四五六七八九十]+[、\.]|[(（]\s*[一二三四五六七八九十]+\s*[)）])/;
        // 列表分割匹配
        this.listPattern = /^\s*(\d+[\.、]|[(（]\s*\d+\s*[)）]|[一二三四五六七八九十]+[、\.]|[(（]\s*[一二三四五六七八九十]+\s*[)）]|[①-⑩]|[ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]+[\.、])\s*/;
        // 图片匹配
        this.imagePattern = /!\[.*?\]\(.*?\)|<img.*?>/;
        // 标题匹配 (#, ##, ###)
        this.headerPattern = /^(#{1,6})\s+(.*)/;
    }
    /**
     * 判断是否是题目标题
     */
    isQuestionHeader(text) {
        // 包含题目关键词
        for (const k of this.questionKeywords) {
            if (text.includes(k))
                return true;
        }
        // 或者以数字序号开头
        if (this.numberPattern.test(text.trim()))
            return true;
        // 或者包含明显的答案标识符
        if (['【答案】', '【解析】', '【解答】'].some(marker => text.includes(marker))) {
            return true;
        }
        return false;
    }
    /**
     * 判断是否是忽略的标题
     */
    isIgnoreHeader(text) {
        for (const k of this.ignoreKeywords) {
            if (text.includes(k))
                return true;
        }
        return false;
    }
    /**
     * 判断是否包含答案关键词
     */
    hasAnswerKeyword(text) {
        for (const k of this.answerKeywords) {
            if (text.includes(k))
                return true;
        }
        return false;
    }
    /**
     * 判断是否包含图片
     */
    hasImage(text) {
        return this.imagePattern.test(text);
    }
    /**
     * 尝试分离单题块中的题目和答案
     * 返回 [question, answer]
     */
    splitQAInBlock(content) {
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
    splitQuestionsInAnswer(answerPart) {
        const questions = [];
        // 按行分割
        const lines = answerPart.split('\n');
        let currentQuestion = [];
        let currentAnswer = [];
        let inAnswer = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line)
                continue;
            // 检测是否是新题目开始（以序号开头）
            const isNewQuestion = this.listPattern.test(line) &&
                !line.startsWith('【') &&
                !line.startsWith('(') &&
                !line.match(/^\d+[\.、]\s*原式/); // 排除 "(1) 原式" 这种答案格式
            if (isNewQuestion && currentQuestion.length > 0) {
                // 保存之前的题目
                questions.push({
                    content: currentQuestion.join('\n').trim(),
                    answer: currentAnswer.join('\n').trim() || undefined
                });
                currentQuestion = [line];
                currentAnswer = [];
                inAnswer = false;
            }
            else if (line.startsWith('【答案】') || (line.match(/^\(\d+\)/) && inAnswer === false && currentQuestion.length > 0)) {
                // 进入答案部分
                inAnswer = true;
                currentAnswer.push(line);
            }
            else if (inAnswer) {
                currentAnswer.push(line);
            }
            else {
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
     */
    isLikelyQuestionList(content, blockType = 'unknown') {
        const lines = content.split('\n');
        let numStartCount = 0;
        let ansMarkerCount = 0;
        const stylesFound = new Set();
        for (const line of lines) {
            const lineStripped = line.trim();
            const match = this.listPattern.exec(lineStripped);
            if (match) {
                numStartCount++;
                stylesFound.add(this.getNumberingType(match[1]));
            }
            if (this.hasAnswerKeyword(line)) {
                ansMarkerCount++;
            }
        }
        // 1. 没有序号开头，肯定不是列表
        if (numStartCount === 0)
            return false;
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
            if (majorCount >= 3)
                return true;
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
            if (majorCount >= 2)
                return true;
        }
        return false;
    }
    /**
     * 主分割方法
     * 混合分割策略:
     * 1. 尝试使用 Markdown 标题 (#) 进行结构化分割
     * 2. 如果结构化分割失败，回退到旧的关键词分割
     */
    splitContent(content) {
        // 尝试标题分割
        const structureBlocks = this.splitByHeaders(content);
        // 统计有效块
        const finalBlocks = [];
        for (const block of structureBlocks) {
            // 关键修复：只要内容看起来像题目列表，强制转为 list_container
            if (this.isLikelyQuestionList(block.content, block.type)) {
                block.type = 'list_container';
            }
            if (block.type === 'ignore')
                continue;
            else if (block.type === 'list_container') {
                // 需要内部再切分
                const subBlocks = this.splitListBlock(block.content);
                finalBlocks.push(...subBlocks);
            }
            else if (block.type === 'unknown') {
                // 对 unknown 块尝试用关键词分割
                if (this.isLikelyQuestionList(block.content)) {
                    const subBlocks = this.splitListBlock(block.content);
                    finalBlocks.push(...subBlocks);
                }
                else {
                    const [q, a] = this.splitQAInBlock(block.content);
                    if (a || this.hasAnswerKeyword(block.content)) {
                        block.content = q;
                        block.answer = a;
                        block.hasImage = this.hasImage(q) || this.hasImage(a);
                        block.hasAnswer = true;
                        finalBlocks.push(block);
                    }
                }
            }
            else {
                // 单题块
                const [q, a] = this.splitQAInBlock(block.content);
                block.content = q;
                block.answer = a;
                block.hasImage = this.hasImage(q) || this.hasImage(a);
                block.hasAnswer = !!(a) || this.hasAnswerKeyword(block.content);
                // 关键过滤：如果没有答案，则可能是知识点，忽略
                if (!block.hasAnswer)
                    continue;
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
     * 按 Markdown 标题分割
     */
    splitByHeaders(content) {
        const lines = content.split('\n');
        const blocks = [];
        let currentBlock = { type: 'unknown', content: [], header: '' };
        for (const line of lines) {
            const lineStripped = line.trim();
            const headerMatch = this.headerPattern.exec(lineStripped);
            if (headerMatch) {
                const headerText = headerMatch[2];
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
                        blocks.push({
                            type: currentBlock.type,
                            content: contentStr,
                            header: currentBlock.header,
                            hasAnswer: false,
                            hasImage: false
                        });
                    }
                }
                // 开始新块
                let blockType = 'unknown';
                if (this.isQuestionHeader(headerText)) {
                    if (['练习', '真题', '测试', '进门考', '挑战'].some(k => headerText.includes(k))) {
                        blockType = 'list_container';
                    }
                    else {
                        blockType = 'single_question';
                    }
                }
                else if (this.isIgnoreHeader(headerText)) {
                    if (this.hasAnswerKeyword(headerText)) {
                        blockType = 'single_question';
                    }
                    else {
                        blockType = 'ignore';
                    }
                }
                else {
                    if (this.hasAnswerKeyword(headerText)) {
                        blockType = 'single_question';
                    }
                    else {
                        blockType = 'ignore';
                    }
                }
                currentBlock = {
                    type: blockType,
                    content: [line],
                    header: headerText
                };
            }
            else {
                currentBlock.content.push(line);
            }
        }
        // 保存最后一个块
        if (currentBlock.content.length > 0) {
            const contentStr = currentBlock.content.join('\n').trim();
            if (contentStr) {
                blocks.push({
                    type: currentBlock.type,
                    content: contentStr,
                    header: currentBlock.header,
                    hasAnswer: false,
                    hasImage: false
                });
            }
        }
        // 统计有效块
        const validCount = blocks.filter(b => b.type !== 'unknown').length;
        if (validCount === 0)
            return [];
        return blocks;
    }
    /**
     * 判断序号类型
     */
    getNumberingType(text) {
        if (!text)
            return 'OTHER';
        // Chinese numerals
        if (/^[一二三四五六七八九十百]+[、\.]$/.test(text))
            return 'CHINESE_NUM';
        if (/^[（(]\s*[一二三四五六七八九十百]+\s*[)）]$/.test(text))
            return 'CHINESE_PAREN';
        // Arabic numerals
        if (/^\d+[.、]$/.test(text))
            return 'ARABIC_DOT';
        // Small nums
        if (/^[（(]\s*\d+\s*[)）]$/.test(text) || /^[①-⑩]$/.test(text) || /^[ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]+[\.、]$/.test(text)) {
            return 'SMALL_NUM';
        }
        return 'OTHER';
    }
    /**
     * 对列表容器块进行二次分割
     */
    splitListBlock(content) {
        const lines = content.split('\n');
        // Pass 1: Determine types present
        const typesFound = new Set();
        for (const line of lines) {
            const lineStripped = line.trim();
            const match = this.listPattern.exec(lineStripped);
            if (match) {
                const text = match[1];
                const style = this.getNumberingType(text);
                if (style !== 'OTHER') {
                    typesFound.add(style);
                }
            }
        }
        // Determine target style based on priority
        let targetStyle = null;
        if (typesFound.has('CHINESE_NUM'))
            targetStyle = 'CHINESE_NUM';
        else if (typesFound.has('CHINESE_PAREN'))
            targetStyle = 'CHINESE_PAREN';
        else if (typesFound.has('ARABIC_DOT'))
            targetStyle = 'ARABIC_DOT';
        else if (typesFound.has('SMALL_NUM'))
            targetStyle = 'SMALL_NUM';
        const subBlocks = [];
        const currentSub = [];
        let introText = '';
        let isFirstChunk = true;
        const flushBlock = (linesList, isFirst = false) => {
            if (linesList.length === 0)
                return;
            let text = linesList.join('\n').trim();
            if (!text)
                return;
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
            if (hasAns) {
                subBlocks.push({
                    content: q,
                    answer: a,
                    hasAnswer: hasAns,
                    hasImage: this.hasImage(text),
                    type: 'single_question'
                });
            }
        };
        for (const line of lines) {
            const lineStripped = line.trim();
            const match = this.listPattern.exec(lineStripped);
            let isSeparator = false;
            if (match) {
                const text = match[1];
                const style = this.getNumberingType(text);
                if (targetStyle) {
                    if (style === targetStyle) {
                        isSeparator = true;
                    }
                }
                else {
                    isSeparator = true;
                }
            }
            if (isSeparator) {
                flushBlock(currentSub, isFirstChunk);
                isFirstChunk = false;
                currentSub.length = 0;
                currentSub.push(line);
            }
            else {
                currentSub.push(line);
            }
        }
        flushBlock(currentSub, isFirstChunk);
        return subBlocks;
    }
    /**
     * 基于关键词和逻辑分割内容为题目块（旧逻辑）
     */
    splitByKeywordsLegacy(content) {
        const lines = content.split('\n');
        const blocks = [];
        const currentBlockLines = [];
        let currentHasAnswer = false;
        const flushLegacyBlock = (linesList, hasAns) => {
            if (linesList.length === 0)
                return;
            const text = linesList.join('\n').trim();
            if (!text)
                return;
            const [q, a] = this.splitQAInBlock(text);
            const finalHasAns = !!(a) || hasAns;
            if (finalHasAns) {
                blocks.push({
                    content: q,
                    answer: a,
                    hasAnswer: finalHasAns,
                    hasImage: this.hasImage(text),
                    type: 'single_question'
                });
            }
        };
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineStripped = line.trim();
            if (!lineStripped)
                continue;
            const isQKeyword = this.isQuestionHeader(lineStripped);
            const isNumStart = this.numberPattern.test(lineStripped);
            let startNew = false;
            if (isQKeyword) {
                startNew = true;
            }
            else if (isNumStart) {
                if (currentHasAnswer) {
                    startNew = true;
                }
                else if (currentBlockLines.length === 0) {
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
     * 清洗题目内容，移除 OCR 残留和异常字符
     * 处理策略：
     * 1. 移除行首的重复数字残留（如 "345345345345 2." -> "2."）
     * 2. 移除孤立的数字串（连续10位以上数字，不在公式中）
     * 3. 清理多余的空行
     */
    cleanQuestionContent(content) {
        let cleaned = content;
        // 策略1: 移除行首的数字残留（数字串后跟序号的情况）
        // 匹配行首的连续数字（6位以上），后面跟着序号
        cleaned = cleaned.replace(/^(\d{6,})\s+(\d+[\.、]|[(（]\s*\d+\s*[)）])/gm, '$2');
        // 策略2: 移除孤立的超长数字串（不在 LaTeX 公式中）
        // 只处理不在 $...$ 或 \(...\) 中的纯数字串（8位以上）
        const lines = cleaned.split('\n');
        const processedLines = lines.map(line => {
            // 如果行包含 LaTeX 公式，谨慎处理
            if (line.includes('$') || line.includes('\\(') || line.includes('\\[')) {
                return line;
            }
            // 移除行首或行尾的孤立长数字串
            return line.replace(/^\d{8,}\s+|\s+\d{8,}$/g, '');
        });
        cleaned = processedLines.join('\n');
        // 策略3: 清理多余空行
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        return cleaned.trim();
    }
    /**
     * 将识别块转换为标准题目格式
     */
    convertToQuestions(blocks) {
        const questions = [];
        for (const block of blocks) {
            if (!block.content || block.content.length < 5)
                continue;
            // 清洗内容，移除 OCR 残留
            const cleanedContent = this.cleanQuestionContent(block.content);
            if (cleanedContent.length < 5)
                continue;
            // 提取题目标题
            let title;
            const titleMatch = cleanedContent.match(/^(?:\d+[\.、]|典型例题|牛刀小试)\s*(.+?)(?:\n|$)/);
            if (titleMatch) {
                title = titleMatch[1].trim();
            }
            // 从答案中提取解析
            let analysis;
            let answer = block.answer ? this.cleanQuestionContent(block.answer) : undefined;
            if (answer) {
                const analysisMatch = answer.match(/【解析】([\s\S]*?)(?=\n\n|$)/);
                if (analysisMatch) {
                    analysis = analysisMatch[1].trim();
                    // 从答案中移除解析部分
                    answer = answer.replace(/【解析】[\s\S]*?(?=\n\n|$)/, '').trim();
                }
                // 移除答案标记
                answer = answer.replace(/^【答案】/, '').trim();
            }
            questions.push({
                title,
                content: cleanedContent,
                answer,
                analysis,
                hasImage: block.hasImage
            });
        }
        return questions;
    }
}
exports.HybridQuestionIdentifier = HybridQuestionIdentifier;
// 导出单例
exports.questionIdentifier = new HybridQuestionIdentifier();
