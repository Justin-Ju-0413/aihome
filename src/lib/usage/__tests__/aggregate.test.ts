import { describe, it, expect } from 'vitest';
import {
  buildKline, totalsFor, groupBySource, groupByModel, byDay, buildTable,
  bucketMsForRange, rangeMs,
} from '../aggregate';
import type { UsageEvent } from '../types';

const ev = (ts: number, cost: number, tokens: number, source = 'cc-switch', model = 'm1'): UsageEvent => ({
  source: source as UsageEvent['source'], provider: source, model,
  inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
  costUsd: cost, timestamp: ts,
});

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);

describe('bucketMsForRange / rangeMs', () => {
  it('maps ranges', () => {
    expect(rangeMs('24h')).toBe(24 * 3600_000);
    expect(bucketMsForRange('5m')).toBe(5 * 60_000);
    expect(bucketMsForRange('24h')).toBe(3600_000);
    expect(bucketMsForRange('30d')).toBe(24 * 3600_000);
  });
});

describe('buildKline', () => {
  it('computes OHLC per bucket, skips empty buckets', () => {
    const bucket = 60_000;
    const events = [
      ev(NOW, 1, 10), ev(NOW + 10_000, 5, 10), ev(NOW + 20_000, 3, 10),
      ev(NOW + 90_000, 7, 10),
    ];
    const k = buildKline(events, bucket, 'cost');
    expect(k).toHaveLength(2);
    expect(k[0]).toEqual({ start: NOW, open: 1, high: 5, low: 1, close: 3, count: 3 });
    expect(k[1]).toEqual({ start: NOW + 60_000, open: 7, high: 7, low: 7, close: 7, count: 1 });
  });
});

describe('totalsFor', () => {
  it('computes today/week/month windows', () => {
    const events = [
      ev(NOW - 3 * 3600_000, 1, 10),
      ev(NOW - 2 * 24 * 3600_000, 2, 10),
      ev(NOW - 4 * 24 * 3600_000, 4, 10),
    ];
    const t = totalsFor(events, NOW);
    expect(t.today).toBe(1);
    expect(t.week).toBe(3);
    expect(t.month).toBe(7);
    expect(t.requests).toBe(3);
  });
});

describe('groupBySource / groupByModel / byDay', () => {
  it('groups by source', () => {
    const g = groupBySource([ev(NOW, 1, 10), ev(NOW, 2, 20, 'claude')]);
    expect(g.find((x) => x.source === 'cc-switch')).toMatchObject({ cost: 1, tokens: 10, count: 1 });
  });
  it('top models limited', () => {
    const events = Array.from({ length: 12 }, (_, i) => ev(NOW, 1, 1, 'cc-switch', `m${i}`));
    expect(groupByModel(events, 5)).toHaveLength(5);
  });
  it('byDay uses local YYYY-MM-DD', () => {
    const d = byDay([ev(Date.UTC(2026, 7, 5, 12), 3, 30)]);
    expect(d[0].day).toBe('2026-08-05');
    expect(d[0].cost).toBe(3);
  });
});

describe('buildTable', () => {
  it('groups source->model with 24h and month windows', () => {
    const events = [
      ev(NOW - 1000, 1, 10, 'cc-switch', 'm1'),
      ev(NOW - 3 * 24 * 3600_000, 2, 10, 'cc-switch', 'm1'),
    ];
    const rows = buildTable(events, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('cc-switch');
    expect(rows[0].cost24h).toBe(1);
    expect(rows[0].costMonth).toBe(3);
    expect(rows[0].models[0].model).toBe('m1');
    expect(rows[0].models[0].tokens24h).toBe(10);
  });
});
