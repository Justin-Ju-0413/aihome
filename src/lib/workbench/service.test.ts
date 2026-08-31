import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSite, saveKey, listKeys } from './crud';
import { queryKeyBalance, refreshAllBalances } from './service';
import { BALANCE_ADAPTERS } from './balance/adapter';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'wb-svc-'));
  process.env.AIHOME_WORKBENCH_DB = path.join(dir, 'test.db');
});
afterEach(() => {
  const g = globalThis as { __workbenchDb?: { isOpen: boolean; close: () => void } };
  if (g.__workbenchDb?.isOpen) g.__workbenchDb.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.AIHOME_WORKBENCH_DB;
  vi.restoreAllMocks();
});

describe('queryKeyBalance', () => {
  it('queries, persists snapshot and status', async () => {
    vi.spyOn(BALANCE_ADAPTERS.deepseek, 'query').mockResolvedValue({
      ok: true, balances: [{ currency: 'CNY', total: '88.00' }],
    });
    const site = createSite({ name: 'DeepSeek 开放平台', url: 'https://platform.deepseek.com' });
    const key = saveKey(site.id, { label: 'a', provider: 'deepseek', key: 'sk-abc' });
    const res = await queryKeyBalance(key.id);
    expect(res.ok).toBe(true);
    const view = listKeys(site.id)[0];
    expect(view.lastCheckStatus).toBe('ok');
    expect(JSON.parse(view.lastBalanceJson!).balances[0].total).toBe('88.00');
  });

  it('persists failure status without balance', async () => {
    vi.spyOn(BALANCE_ADAPTERS.deepseek, 'query').mockResolvedValue({ ok: false, error: 'invalid_key', message: 'bad' });
    const site = createSite({ name: 'DeepSeek 开放平台', url: 'https://platform.deepseek.com' });
    const key = saveKey(site.id, { label: 'a', provider: 'deepseek', key: 'sk-bad' });
    const res = await queryKeyBalance(key.id);
    expect(res.ok).toBe(false);
    expect(listKeys(site.id)[0].lastCheckStatus).toBe('invalid');
  });

  it('single-flights concurrent queries for same key', async () => {
    let calls = 0;
    vi.spyOn(BALANCE_ADAPTERS.deepseek, 'query').mockImplementation(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, balances: [{ currency: 'CNY', total: '1.00' }] };
    });
    const site = createSite({ name: 'DeepSeek 开放平台', url: 'https://platform.deepseek.com' });
    const key = saveKey(site.id, { label: 'a', provider: 'deepseek', key: 'sk-abc' });
    const [r1, r2] = await Promise.all([queryKeyBalance(key.id), queryKeyBalance(key.id)]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it('marks unsupported for provider without adapter', async () => {
    const site = createSite({ name: 'x', url: 'https://x.com' });
    const key = saveKey(site.id, { label: 'a', provider: 'none', key: 'nokey' });
    const res = await queryKeyBalance(key.id);
    expect(res).toEqual({ ok: false, error: 'unsupported', message: '该平台不支持余额查询' });
    expect(listKeys(site.id)[0].lastCheckStatus).toBe('unsupported');
  });
});

describe('refreshAllBalances', () => {
  it('refreshes all configured keys and returns summary', async () => {
    vi.spyOn(BALANCE_ADAPTERS.deepseek, 'query').mockResolvedValue({ ok: true, balances: [{ currency: 'CNY', total: '1.00' }] });
    vi.spyOn(BALANCE_ADAPTERS.openrouter, 'query').mockResolvedValue({ ok: false, error: 'invalid_key', message: 'bad' });
    const s1 = createSite({ name: 'DeepSeek 开放平台', url: 'https://platform.deepseek.com' });
    const s2 = createSite({ name: 'OpenRouter', url: 'https://openrouter.ai' });
    saveKey(s1.id, { label: 'a', provider: 'deepseek', key: 'k1' });
    saveKey(s2.id, { label: 'b', provider: 'openrouter', key: 'k2' });
    const summary = await refreshAllBalances();
    expect(summary.checked).toBe(2);
    expect(summary.ok).toBe(1);
    expect(summary.byError.invalid_key).toBe(1);
  });
});
