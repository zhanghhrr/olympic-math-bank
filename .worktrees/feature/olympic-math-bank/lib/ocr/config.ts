/**
 * OCR模块配置
 */

export const OCR_CONFIG = {
  // 支持的文件格式
  supportedFormats: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ],

  // 最大文件大小 (200MB，MinerU v4 API 上限)
  maxFileSize: 200 * 1024 * 1024,

  // 默认语言
  defaultLanguage: 'ch',

  // 处理超时时间 (10分钟，MinerU v4 API 异步处理)
  processingTimeout: 600000,

  // MinerU v4 API 配置
  mineruApiUrl: 'https://mineru.net',
  mineruApiToken: process.env.MINERU_API_TOKEN || '',

  // MinerU v4 默认参数：VLM 模型 + 强制 OCR + 公式 + 表格
  mineruDefaults: {
    model_version: 'vlm' as const,
    is_ocr: true,
    enable_formula: true,
    enable_table: true,
    language: 'ch',
  },
};

// 提示词模板
export const PROMPT_TEMPLATES = {
  // 数学题目识别
  mathProblem: `请从图片中提取数学题目信息，并以JSON格式返回：
{
  "title": "题目标题（如有）",
  "content": "题目内容",
  "answer": "答案（如有）",
  "analysis": "解析（如有）"
}

注意：
1. 保持数学公式的LaTeX格式
2. 如果某项不存在，返回空字符串
3. 只返回JSON，不要有其他文字`,

  // 带标签匹配的提示词
  mathProblemWithTags: `请从图片中提取数学题目信息，并以JSON格式返回：
{
  "title": "题目标题（如有）",
  "content": "题目内容",
  "answer": "答案（如有）",
  "analysis": "解析（如有）",
  "knowledgeTags": ["可能涉及的知识点标签"]
}

注意：
1. 保持数学公式的LaTeX格式
2. 根据题目内容分析可能涉及的知识点
3. 只返回JSON，不要有其他文字`,
};

// 标签匹配关键词
export const TAG_KEYWORDS: Record<string, string[]> = {
  // 计算模块
  '计算模块': ['计算', '运算', '加减', '乘除', '速算', '巧算'],
  '整数': ['整数', '自然数'],
  '小数': ['小数', '零点'],
  '分数': ['分数', '分母', '分子'],
  '加法横式': ['加法横式', '横式'],
  '加法竖式': ['竖式加法', '竖式'],
  '凑整法': ['凑整', '凑成'],
  '提取公因数': ['提取公因数', '分配律'],

  // 几何模块
  '几何模块': ['图形', '面积', '周长', '体积'],
  '长方形': ['长方形', '矩形'],
  '正方形': ['正方形'],
  '三角形': ['三角形'],
  '圆形': ['圆', '半径', '直径'],

  // 应用题模块
  '应用题模块': ['应用题', '问题'],
  '和差问题': ['和差'],
  '和倍问题': ['和倍'],
  '差倍问题': ['差倍'],
  '鸡兔同笼': ['鸡兔'],
  '行程问题': ['行程', '速度', '时间'],

  // 计数模块
  '计数模块': ['计数', '枚举', '排列', '组合'],
  '枚举法': ['枚举', '列举'],
  '加法原理': ['加法原理'],
  '乘法原理': ['乘法原理'],

  // 数论模块
  '数论模块': ['质数', '因数', '倍数', '余数'],
  '质数': ['质数', '素数'],
  '因数': ['因数', '约数'],
  '倍数': ['倍数'],
};
