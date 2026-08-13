import type { BalanceResult } from '../types';
import { fetchJson } from './adapter';

const BASE = process.env.AIHOME_WORKBENCH_OPENAI_BASE_URL ?? 'https://api.openai.com';

export const openaiAdapter = {
  provider: 'openai' as const,
  async query(key: string, timeoutMs = 10_000): Promise<BalanceResult> {
    let res: { status: number; json: unknown };
    try {
      res = await fetchJson(BASE, '/v1/dashboard/billing/credit_grants', key, timeoutMs);
    } catch (e) {
      return { ok: false, error: (e as Error).name === 'AbortError' ? 'timeout' : 'network', message: String(e) };
    }
    // 普通 key 此端点多已关闭：404 → unsupported
    if (res.status === 404) return { ok: false, error: 'unsupported', message: 'OpenAI 已关闭普通 key 的余额查询' };
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'invalid_key', message: 'key 无效' };
    if (res.status === 429) return { ok: false, error: 'rate_limited', message: '请求过频' };
    if (res.status !== 200) return { ok: false, error: 'error', message: `HTTP ${res.status}` };
    const body = res.json as { total_available?: number; total_granted?: number; total_used?: number };
    if (typeof body.total_available !== 'number') return { ok: false, error: 'error', message: '响应缺少 total_available' };
    return { ok: true, balances: [{ currency: 'USD', total: String(body.total_available) }] };
  },
};
