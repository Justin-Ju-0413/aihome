import { getSite, createSite } from './crud';
import { openWorkbenchDb, siteSlug } from './db';
import type { SiteInput } from './types';

export const SEED_SITES: SiteInput[] = [
  { name: 'DeepSeek 开放平台', url: 'https://platform.deepseek.com', category: 'API平台', tags: ['deepseek', 'api', '余额'], notes: '深度求索 API 控制台：key 管理、余额、用量' },
  { name: 'OpenAI Platform', url: 'https://platform.openai.com', category: 'API平台', tags: ['openai', 'api'] },
  { name: 'Anthropic Console', url: 'https://console.anthropic.com', category: 'API平台', tags: ['anthropic', 'claude', 'api'] },
  { name: '火山方舟', url: 'https://console.volcengine.com/ark', category: 'API平台', tags: ['火山方舟', 'ark', 'api'] },
  { name: 'OpenRouter', url: 'https://openrouter.ai', category: 'API平台', tags: ['openrouter', 'api', '余额'] },
  { name: '硅基流动', url: 'https://cloud.siliconflow.cn', category: 'API平台', tags: ['siliconflow', 'api'] },
  { name: 'Gemini AI Studio', url: 'https://aistudio.google.com', category: 'API平台', tags: ['gemini', 'google', 'api'] },
  { name: 'Kimi 开放平台', url: 'https://platform.moonshot.cn', category: 'API平台', tags: ['kimi', 'moonshot', 'api'] },
  { name: '智谱开放平台', url: 'https://open.bigmodel.cn', category: 'API平台', tags: ['智谱', 'glm', 'api'] },
  { name: '通义百炼', url: 'https://bailian.console.aliyun.com', category: 'API平台', tags: ['通义', 'qwen', 'api'] },
  { name: 'ChatGPT', url: 'https://chatgpt.com', category: '对话', tags: ['openai', 'chat'] },
  { name: 'Claude', url: 'https://claude.ai', category: '对话', tags: ['anthropic', 'chat'] },
  { name: 'Gemini', url: 'https://gemini.google.com', category: '对话', tags: ['google', 'chat'] },
  { name: 'DeepSeek Chat', url: 'https://chat.deepseek.com', category: '对话', tags: ['deepseek', 'chat'] },
  { name: 'Kimi', url: 'https://kimi.moonshot.cn', category: '对话', tags: ['kimi', 'chat'] },
  { name: '豆包', url: 'https://www.doubao.com', category: '对话', tags: ['豆包', 'chat'] },
  { name: 'Midjourney', url: 'https://www.midjourney.com', category: '图像', tags: ['mj', '图像'] },
  { name: '即梦', url: 'https://jimeng.jianying.com', category: '图像', tags: ['即梦', '图像'] },
  { name: 'GitHub Copilot', url: 'https://github.com/features/copilot', category: '代码', tags: ['github', 'copilot'] },
  { name: 'Cursor', url: 'https://cursor.com', category: '代码', tags: ['cursor', 'ide'] },
  { name: 'Notion AI', url: 'https://www.notion.so', category: '知识库', tags: ['notion', 'ai'] },
  { name: 'Perplexity', url: 'https://www.perplexity.ai', category: '搜索', tags: ['perplexity', '搜索'] },
];

export function seedBuiltins(): number {
  const db = openWorkbenchDb();
  let added = 0;
  for (const input of SEED_SITES) {
    const id = siteSlug(input.name);
    if (getSite(id)) continue;
    createSite(input);
    db.prepare('UPDATE sites SET is_builtin = 1 WHERE id = ?').run(id);
    added++;
  }
  return added;
}

export function restoreBuiltins(): number {
  return seedBuiltins();
}
