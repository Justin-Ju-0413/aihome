export interface ProviderTemplate {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { id: 'anthropic', name: 'Anthropic 官方', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.5' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { id: 'volcengine-coding', name: '火山方舟 Coding Plan', baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3', model: 'ark-code-latest' },
  { id: 'glm', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2' },
  { id: 'kimi', name: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.7-code' },
];

const isHttpUrl = (v: string) => /^https?:\/\/.+/i.test(v);

export function validateProviderInput(input: {
  name?: string; baseUrl?: string; model?: string; apiKey?: string;
}): string | null {
  if (!input.name?.trim()) return 'name 不能为空';
  if (!isHttpUrl(input.baseUrl ?? '')) return 'baseUrl 必须是 http(s) 地址';
  if (!input.model?.trim()) return 'model 不能为空';
  if (!input.apiKey || input.apiKey.length < 8) return 'apiKey 至少 8 位';
  return null;
}
