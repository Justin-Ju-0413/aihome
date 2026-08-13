import type { BalanceResult } from '../types';
import { fetchJson } from './adapter';

const BASE = process.env.AIHOME_WORKBENCH_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';

export const deepseekAdapter = {
  provider: 'deepseek' as const,
  async query(key: string, timeoutMs = 10_000): Promise<BalanceResult> {
    let res: { status: number; json: unknown };
    try {
      res = await fetchJson(BASE, '/user/balance', key, timeoutMs);
    } catch (e) {
      return { ok: false, error: (e as Error).name === 'AbortError' ? 'timeout' : 'network', message: String(e) };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'invalid_key', message: 'key 无效' };
    if (res.status === 429) return { ok: false, error: 'rate_limited', message: '请求过频' };
    if (res.status !== 200) return { ok: false, error: 'error', message: `HTTP ${res.status}` };
    const body = res.json as { is_available?: boolean; balance_infos?: { currency: string; total_balance: string; granted_balance?: string; topped_up_balance?: string }[] };
    const balances = (body.balance_infos ?? []).map((b) => {
      const noteParts: string[] = [];
      if (b.topped_up_balance) noteParts.push(`到账 ${b.topped_up_balance}`);
      if (b.granted_balance) noteParts.push(`赠送 ${b.granted_balance}`);
      return { currency: b.currency, total: b.total_balance, note: noteParts.length ? noteParts.join(' · ') : undefined };
    });
    if (balances.length === 0) return { ok: false, error: 'error', message: '响应缺少 balance_infos' };
    return { ok: true, balances };
  },
};
