import { describe, it, expect, vi, afterEach } from 'vitest';
import { BALANCE_ADAPTERS } from './adapter';

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  ));
}

function mockFetchNetworkError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
}

afterEach(() => vi.unstubAllGlobals());

describe('deepseek adapter', () => {
  it('parses balance_infos into entries', async () => {
    mockFetchOnce(200, {
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }],
    });
    const res = await BALANCE_ADAPTERS.deepseek.query('sk-xxx');
    expect(res).toEqual({ ok: true, balances: [{ currency: 'CNY', total: '110.00', note: '到账 100.00 · 赠送 10.00' }] });
  });
  it('maps 401 to invalid_key', async () => {
    mockFetchOnce(401, { error: { message: 'Unauthorized' } });
    const res = await BALANCE_ADAPTERS.deepseek.query('sk-bad');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_key');
  });
});

describe('openrouter adapter', () => {
  it('parses key usage/limit', async () => {
    mockFetchOnce(200, { data: { label: 'main', usage: 2500, limit: 10000, is_free_tier: false } });
    const res = await BALANCE_ADAPTERS.openrouter.query('sk-or');
    expect(res).toEqual({ ok: true, balances: [{ currency: 'USD', total: '7500', note: '已用 2500 / 限额 10000' }] });
  });
  it('handles free tier without limit', async () => {
    mockFetchOnce(200, { data: { label: 'free', usage: 12, limit: null, is_free_tier: true } });
    const res = await BALANCE_ADAPTERS.openrouter.query('sk-or');
    expect(res.ok).toBe(true);
  });
});

describe('openai adapter', () => {
  it('maps missing credit_grants endpoint to unsupported', async () => {
    mockFetchOnce(404, { error: { message: 'not found' } });
    const res = await BALANCE_ADAPTERS.openai.query('sk-oa');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('unsupported');
  });
  it('parses credit_grants when available', async () => {
    mockFetchOnce(200, { total_available: 12.34, total_granted: 2.0, total_used: 0 });
    const res = await BALANCE_ADAPTERS.openai.query('sk-oa');
    expect(res).toEqual({ ok: true, balances: [{ currency: 'USD', total: '12.34' }] });
  });
});

describe('error mapping', () => {
  it('maps network failure', async () => {
    mockFetchNetworkError();
    const res = await BALANCE_ADAPTERS.deepseek.query('sk-xxx');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('network');
  });
  it('maps timeout via abort', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, opts?: { signal?: AbortSignal }) => new Promise((_r, rej) => {
      opts?.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')));
    })));
    const res = await BALANCE_ADAPTERS.deepseek.query('sk-xxx', 5);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('timeout');
  });
  it('maps 429 to rate_limited', async () => {
    mockFetchOnce(429, { error: 'rate limit' });
    const res = await BALANCE_ADAPTERS.openrouter.query('sk-xxx');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('rate_limited');
  });
});
