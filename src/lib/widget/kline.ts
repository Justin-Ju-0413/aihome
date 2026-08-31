export type Candle = { open: number; high: number; low: number; close: number; count: number };
export type SpendEvent = { ts: number; amount: number };

export function buildCandles(events: SpendEvent[], opts: { bucketMs: number }): Candle[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const first = sorted[0].ts;
  const last = sorted[sorted.length - 1].ts;
  const bucketCount = Math.ceil((last - first + 1) / opts.bucketMs);
  const candles: Candle[] = Array.from({ length: bucketCount }, () => ({
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    count: 0,
  }));
  for (const e of sorted) {
    const idx = Math.floor((e.ts - first) / opts.bucketMs);
    const c = candles[idx];
    if (c.count === 0) {
      c.open = c.high = c.low = c.close = e.amount;
    } else {
      c.close = e.amount;
      c.high = Math.max(c.high, e.amount);
      c.low = Math.min(c.low, e.amount);
    }
    c.count += 1;
  }
  return candles;
}

export function changePercent(from: number, to: number): number {
  if (from === 0) return 0;
  return ((to - from) / from) * 100;
}

export type SpendTier = 'green' | 'yellow' | 'red';

export function spendTier(amountUsd: number): SpendTier {
  if (amountUsd >= 50) return 'red';
  if (amountUsd >= 20) return 'yellow';
  return 'green';
}
