import { describe, expect, it } from 'vitest';
import { buildCandles, changePercent, spendTier } from './kline';

describe('buildCandles', () => {
  it('buckets events into OHLC candles', () => {
    const events = [
      { ts: 1000, amount: 1 },
      { ts: 2000, amount: 3 },
      { ts: 2500, amount: 2 },
      { ts: 9000, amount: 5 },
    ];
    const candles = buildCandles(events, { bucketMs: 3000 });
    expect(candles).toHaveLength(3);
    expect(candles[0]).toEqual({ open: 1, high: 3, low: 1, close: 2, count: 3 });
    expect(candles[2]).toEqual({ open: 5, high: 5, low: 5, close: 5, count: 1 });
  });

  it('handles empty events', () => {
    expect(buildCandles([], { bucketMs: 3000 })).toEqual([]);
  });

  it('handles single event', () => {
    const candles = buildCandles([{ ts: 500, amount: 2 }], { bucketMs: 1000 });
    expect(candles).toHaveLength(1);
    expect(candles[0]).toEqual({ open: 2, high: 2, low: 2, close: 2, count: 1 });
  });
});

describe('changePercent', () => {
  it('computes percent change', () => {
    expect(changePercent(2, 3)).toBeCloseTo(50);
    expect(changePercent(0, 3)).toBe(0);
    expect(changePercent(4, 3)).toBeCloseTo(-25);
  });
});

describe('spendTier', () => {
  it('maps spend to color tier', () => {
    expect(spendTier(10)).toBe('green');
    expect(spendTier(20)).toBe('yellow');
    expect(spendTier(30)).toBe('yellow');
    expect(spendTier(50)).toBe('red');
    expect(spendTier(60)).toBe('red');
  });
});
