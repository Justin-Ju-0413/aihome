import type { UsageEvent } from './types';

export type UsageRange = '5m' | '15m' | '30m' | '1h' | '24h' | '7d' | '30d';
export type UsageDimension = 'cost' | 'tokens';

export const USAGE_RANGES: UsageRange[] = ['5m', '15m', '30m', '1h', '24h', '7d', '30d'];

export function rangeMs(range: UsageRange): number {
  const m = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '24h': 1440, '7d': 10080, '30d': 43200 }[range];
  return m * 60_000;
}

export function bucketMsForRange(range: UsageRange): number {
  if (range === '30d') return 24 * 3600_000;
  if (range === '5m' || range === '15m' || range === '30m') return rangeMs(range);
  return 3600_000;
}

export interface KlineBucket {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
  count: number;
}

function valueOf(e: UsageEvent, dimension: UsageDimension): number {
  return dimension === 'cost'
    ? e.costUsd
    : e.inputTokens + e.outputTokens + e.cacheReadTokens + e.cacheWriteTokens;
}

export function buildKline(
  events: UsageEvent[],
  bucketMs: number,
  dimension: UsageDimension
): KlineBucket[] {
  const buckets = new Map<number, KlineBucket>();
  for (const e of events) {
    const start = Math.floor(e.timestamp / bucketMs) * bucketMs;
    const v = valueOf(e, dimension);
    const b = buckets.get(start);
    if (!b) {
      buckets.set(start, { start, open: v, high: v, low: v, close: v, count: 1 });
    } else {
      b.high = Math.max(b.high, v);
      b.low = Math.min(b.low, v);
      b.close = v;
      b.count += 1;
    }
  }
  return [...buckets.values()].sort((a, b) => a.start - b.start);
}

export interface Totals {
  today: number;
  week: number;
  month: number;
  requests: number;
  tokensInput: number;
  tokensOutput: number;
}

export function totalsFor(events: UsageEvent[], now = Date.now()): Totals {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayMs = dayStart.getTime();
  const weekStart = dayMs - dayStart.getDay() * 24 * 3600_000;
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const t: Totals = { today: 0, week: 0, month: 0, requests: events.length, tokensInput: 0, tokensOutput: 0 };
  for (const e of events) {
    t.tokensInput += e.inputTokens;
    t.tokensOutput += e.outputTokens;
    if (e.timestamp >= dayMs) t.today += e.costUsd;
    if (e.timestamp >= weekStart) t.week += e.costUsd;
    if (e.timestamp >= monthStart.getTime()) t.month += e.costUsd;
  }
  return t;
}

export function groupBySource(events: UsageEvent[]): Array<{ source: string; cost: number; tokens: number; count: number }> {
  const map = new Map<string, { cost: number; tokens: number; count: number }>();
  for (const e of events) {
    const g = map.get(e.source) ?? { cost: 0, tokens: 0, count: 0 };
    g.cost += e.costUsd;
    g.tokens += e.inputTokens + e.outputTokens;
    g.count += 1;
    map.set(e.source, g);
  }
  return [...map.entries()]
    .map(([source, g]) => ({ source, ...g }))
    .sort((a, b) => b.cost - a.cost);
}

export function groupByModel(events: UsageEvent[], limit = 10): Array<{ model: string; cost: number; tokens: number; count: number }> {
  const map = new Map<string, { cost: number; tokens: number; count: number }>();
  for (const e of events) {
    const g = map.get(e.model) ?? { cost: 0, tokens: 0, count: 0 };
    g.cost += e.costUsd;
    g.tokens += e.inputTokens + e.outputTokens;
    g.count += 1;
    map.set(e.model, g);
  }
  return [...map.entries()]
    .map(([model, g]) => ({ model, ...g }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit);
}

export function byDay(events: UsageEvent[]): Array<{ day: string; cost: number; tokens: number; count: number }> {
  const map = new Map<string, { cost: number; tokens: number; count: number }>();
  for (const e of events) {
    const d = new Date(e.timestamp);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const g = map.get(day) ?? { cost: 0, tokens: 0, count: 0 };
    g.cost += e.costUsd;
    g.tokens += e.inputTokens + e.outputTokens;
    g.count += 1;
    map.set(day, g);
  }
  return [...map.entries()]
    .map(([day, g]) => ({ day, ...g }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

export interface TableModelRow {
  model: string;
  cost24h: number;
  tokens24h: number;
  costMonth: number;
  tokensMonth: number;
}

export interface TableRow {
  source: string;
  cost24h: number;
  tokens24h: number;
  costMonth: number;
  tokensMonth: number;
  models: TableModelRow[];
}

export function buildTable(events: UsageEvent[], now = Date.now()): TableRow[] {
  const since24h = now - 24 * 3600_000;
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const sinceMonth = monthStart.getTime();
  const bySource = new Map<string, Map<string, TableModelRow>>();
  for (const e of events) {
    const models = bySource.get(e.source) ?? new Map<string, TableModelRow>();
    bySource.set(e.source, models);
    const row = models.get(e.model) ?? { model: e.model, cost24h: 0, tokens24h: 0, costMonth: 0, tokensMonth: 0 };
    const tokens = e.inputTokens + e.outputTokens;
    if (e.timestamp >= since24h) {
      row.cost24h += e.costUsd;
      row.tokens24h += tokens;
    }
    if (e.timestamp >= sinceMonth) {
      row.costMonth += e.costUsd;
      row.tokensMonth += tokens;
    }
    models.set(e.model, row);
  }
  const out: TableRow[] = [];
  for (const [source, models] of bySource) {
    const modelRows = [...models.values()].sort((a, b) => b.cost24h + b.costMonth - (a.cost24h + a.costMonth));
    const total: TableRow = {
      source,
      cost24h: 0, tokens24h: 0, costMonth: 0, tokensMonth: 0,
      models: modelRows,
    };
    for (const m of modelRows) {
      total.cost24h += m.cost24h;
      total.tokens24h += m.tokens24h;
      total.costMonth += m.costMonth;
      total.tokensMonth += m.tokensMonth;
    }
    out.push(total);
  }
  return out.sort((a, b) => b.cost24h + b.costMonth - (a.cost24h + a.costMonth));
}
