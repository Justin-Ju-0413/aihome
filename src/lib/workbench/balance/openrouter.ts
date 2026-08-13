import type { BalanceResult } from '../types';
import { fetchJson } from './adapter';

const BASE = process.env.AIHOME_WORKBENCH_OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';

export const openrouterAdapter = {
  provider: 'openrouter' as const,
  async query(key: string, timeoutMs = 10_000): Promise<BalanceResult> {
    let res: { status: number; json: unknown };
    try {
      res = await fetchJson(BASE, '/auth/key', key, timeoutMs);
    } catch (e) {
      return { ok: false, error: (e as Error).name === 'AbortError' ? 'timeout' : 'network', message: String(e) };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'invalid_key', message: 'key 无效' };
    if (res.status === 429) return { ok: false, error: 'rate_limited', message: '请求过频' };
    if (res.status !== 200) return { ok: false, error: 'error', message: `HTTP ${res.status}` };
    const body = res.json as { data?: { usage?: number; limit?: number | null; is_free_tier?: boolean } };
    const data = body.data;
    if (!data) return { ok: false, error: 'error', message: '响应缺少 data' };
    const usage = typeof data.usage === 'number' ? data.usage : 0;
    const limit = typeof data.limit === 'number' ? data.limit : null;
    if (limit === null) {
      return { ok: true, balances: [{ currency: 'USD', total: String(usage), note: '免费层 · 已用用量' }] };
    }
    return {
      ok: true,
      balances: [{ currency: 'USD', total: String(Math.max(limit - usage, 0)), note: `已用 ${usage} / 限额 ${limit}` }],
    };
  },
};
