import { getKeyRecord, recordKeyCheck, listKeys, setLastFullRefreshAt } from './crud';
import { BALANCE_ADAPTERS } from './balance/adapter';
import type { BalanceResult, CheckStatus } from './types';

const inflight = new Map<number, Promise<BalanceResult>>();

export async function queryKeyBalance(keyId: number): Promise<BalanceResult> {
  const existing = inflight.get(keyId);
  if (existing) return existing;

  const task = (async (): Promise<BalanceResult> => {
    const key = getKeyRecord(keyId);
    if (!key) return { ok: false, error: 'error', message: 'key 不存在' };
    const adapter = BALANCE_ADAPTERS[key.provider];
    if (!adapter) {
      recordKeyCheck(keyId, 'unsupported', null);
      return { ok: false, error: 'unsupported', message: '该平台不支持余额查询' };
    }
    let result: BalanceResult;
    try {
      result = await adapter.query(key.key);
    } catch (e) {
      result = { ok: false, error: 'error', message: String(e) };
    }
    // BalanceResult.error 用 invalid_key；CheckStatus 用 invalid
    const status: CheckStatus = result.ok ? 'ok' : (result.error === 'invalid_key' ? 'invalid' : result.error);
    recordKeyCheck(keyId, status, result.ok ? JSON.stringify(result) : null);
    return result;
  })();

  inflight.set(keyId, task);
  try {
    return await task;
  } finally {
    inflight.delete(keyId);
  }
}

export async function refreshAllBalances(): Promise<{ checked: number; ok: number; byError: Record<string, number> }> {
  const keys = listKeys().filter((k) => k.provider !== 'none');
  let ok = 0;
  const byError: Record<string, number> = {};
  for (const k of keys) {
    const res = await queryKeyBalance(k.id);
    if (res.ok) ok++;
    else byError[res.error] = (byError[res.error] ?? 0) + 1;
  }
  setLastFullRefreshAt(new Date().toISOString());
  return { checked: keys.length, ok, byError };
}
