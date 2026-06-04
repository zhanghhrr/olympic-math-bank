export const OCR_CONFIG = {
  supportedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  defaultLanguage: 'chi_sim+eng',
  processingTimeout: 60000, // 60 seconds
};

export const PROMPT_TEMPLATES = {
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
};
