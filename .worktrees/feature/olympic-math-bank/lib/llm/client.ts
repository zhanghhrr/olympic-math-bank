import OpenAI from 'openai';

let clientCache: OpenAI | null = null;

function getClient(): OpenAI {
  if (!clientCache) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'your-deepseek-api-key') {
      throw new Error('DEEPSEEK_API_KEY 未配置');
    }
    clientCache = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    });
  }
  return clientCache;
}

export function clearLLMClientCache() {
  clientCache = null;
}

export function isLLMAvailable(): boolean {
  const key = process.env.DEEPSEEK_API_KEY;
  return !!key && key !== 'your-deepseek-api-key';
}

export interface LLMTagResult {
  tagName: string;
  path: string;
  confidence: number;
  reasoning: string;
}

export async function matchTagsViaLLM(
  questionContent: string,
  candidateTags: Array<{ name: string; path: string; level: number }>,
): Promise<LLMTagResult[]> {
  const client = getClient();

  const candidatesText = candidateTags
    .map((t, i) => `${i + 1}. [${t.name}] ${t.path} (层级${t.level})`)
    .join('\n');

  const prompt = `你是一位小学数学竞赛教研专家。请根据以下题目的内容，从候选标签列表中选出最匹配的 3-5 个知识点标签。

【题目内容】
${questionContent.substring(0, 2000)}

【候选标签】（仅能从中选择，不可编造新标签）
${candidatesText}

请以 JSON 数组格式返回结果，每个元素包含：
- tagName: 精确的标签名称（必须与候选列表完全一致）
- confidence: 0-100 的置信度分数
- reasoning: 10字以内的简短理由

只返回 JSON，不要其他内容。格式示例：
[{"tagName":"乘法原理","confidence":90,"reasoning":"分步计数"}]`;

  const response = await client.chat.completions.create({
    model: 'deepseek-v4-pro',
    messages: [
      { role: 'system', content: '你是小学数学竞赛教研专家，只从候选列表中选择标签，返回纯JSON。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    max_tokens: 800,
  });

  const raw = response.choices[0]?.message?.content || '[]';

  try {
    const parsed = JSON.parse(raw);
    const results = Array.isArray(parsed) ? parsed : (parsed.tags || parsed.matches || []);
    return results.map((r: any) => ({
      tagName: r.tagName || r.tag_name || r.name || '',
      path: r.path || '',
      confidence: r.confidence || 50,
      reasoning: r.reasoning || '',
    }));
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return [];
      }
    }
    return [];
  }
}
