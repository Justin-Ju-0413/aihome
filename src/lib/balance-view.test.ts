import { describe, it, expect } from 'vitest';
import { balanceViewFromKey } from './balance-view';
import type { KeyRecord, CheckStatus } from './workbench/types';

const mk = (partial: Record<string, unknown>): Pick<KeyRecord, 'lastCheckStatus' | 'lastBalanceJson'> => ({
  id: 1, siteId: 's', label: 'a', provider: 'deepseek', isCurrent: true,
  lastCheckStatus: 'never' as CheckStatus, lastBalanceJson: null, lastCheckAt: null,
  ...partial,
} as Pick<KeyRecord, 'lastCheckStatus' | 'lastBalanceJson'>);

describe('balanceViewFromKey', () => {
  it('shows balance for ok status', () => {
    const v = balanceViewFromKey(mk({
      lastCheckStatus: 'ok',
      lastBalanceJson: JSON.stringify({ ok: true, balances: [{ currency: 'CNY', total: '110.00', note: '到账 100.00' }] }),
      lastCheckAt: '2026-08-10T08:00:00.000Z',
    }));
    expect(v.status).toBe('ok');
    expect(v.text).toContain('110.00');
    expect(v.detail).toContain('到账 100.00');
  });
  it('shows openrouter used/limit from note', () => {
    const v = balanceViewFromKey(mk({
      lastCheckStatus: 'ok',
      lastBalanceJson: JSON.stringify({ ok: true, balances: [{ currency: 'USD', total: '7500', note: '已用 2500 / 限额 10000' }] }),
    }));
    expect(v.text).toContain('已用');
    expect(v.text).toContain('10000');
  });
  it('never → config prompt', () => {
    const v = balanceViewFromKey(mk({ lastCheckStatus: 'never' }));
    expect(v.status).toBe('never');
    expect(v.text).toBe('配置 key');
  });
  it('invalid → red message', () => {
    const v = balanceViewFromKey(mk({ lastCheckStatus: 'invalid' }));
    expect(v.status).toBe('invalid');
    expect(v.text).toContain('无效');
  });
  it('unsupported → unavailable message', () => {
    const v = balanceViewFromKey(mk({ lastCheckStatus: 'unsupported' }));
    expect(v.status).toBe('unsupported');
    expect(v.text).toContain('不可用');
  });
});
