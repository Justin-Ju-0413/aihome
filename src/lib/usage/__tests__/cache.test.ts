import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { UsageCache } from '../cache';
import type { ScannedEvent, Checkpoint } from '../types';

let dir: string;
let cache: UsageCache;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-cache-'));
  cache = UsageCache.open(path.join(dir, 'cache.db'));
});

afterAll(() => {
  cache.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ev = (rawId: string, ts: number): ScannedEvent => ({
  rawId, source: 'cc-switch', provider: 'opencode', model: 'deepseek-v4-flash',
  inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1,
  costUsd: 0.001, timestamp: ts,
});

describe('UsageCache', () => {
  it('inserts events and dedupes by (source, raw_id)', () => {
    cache.insertEvents([ev('a', 1000), ev('b', 2000), ev('a', 3000)]);
    expect(cache.countEvents('cc-switch')).toBe(2);
  });
  it('stores and restores checkpoints', () => {
    const cp: Checkpoint = { ts: 42, mtime: 99 };
    cache.setCheckpoint('cc-switch', cp);
    expect(cache.getCheckpoint('cc-switch')).toEqual(cp);
    expect(cache.getCheckpoint('claude')).toEqual({ ts: 0, mtime: 0 });
  });
  it('queries events by time window', () => {
    const rows = cache.queryEvents(['cc-switch'], 1500);
    expect(rows.map((r) => r.rawId)).toEqual(['b']);
  });
  it('filters by source', () => {
    expect(cache.countEvents('claude')).toBe(0);
  });
  it('meta round-trip', () => {
    cache.setMeta('last_scan', '123');
    expect(cache.getMeta('last_scan')).toBe('123');
  });
  it('migrates v1 schema adding pricing_source column', () => {
    const p = path.join(dir, 'v1.db');
    const raw = new DatabaseSync(p);
    raw.exec(`CREATE TABLE events (
    raw_id TEXT NOT NULL, source TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL, cache_write_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL, latency_ms INTEGER, session_id TEXT, ts INTEGER NOT NULL,
    PRIMARY KEY (source, raw_id));
    PRAGMA user_version = 1;`);
    raw.prepare(`INSERT INTO events (raw_id, source, provider, model, input_tokens, output_tokens,
    cache_read_tokens, cache_write_tokens, cost_usd, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('r1', 'claude', 'claude-code', 'unknown-model-x', 10, 5, 0, 0, 0, 1000);
    raw.close();
    const c = UsageCache.open(p);
    try {
      const rows = c.queryEvents(['claude'], 0);
      expect(rows).toHaveLength(1);
      expect(rows[0].pricingSource).toBeUndefined();
      const n = c.backfillPricingSource((m) => (m === 'unknown-model-x' ? 'unknown' : null));
      expect(n).toBe(1);
      const after = c.queryEvents(['claude'], 0);
      expect(after[0].pricingSource).toBe('unknown');
    } finally {
      c.close();
    }
  });
  it('writes and reads pricing_source on insert/query', () => {
    cache.insertEvents([{ ...ev('ps', 5000), pricingSource: 'bundled' }]);
    const rows = cache.queryEvents(['cc-switch'], 0);
    const hit = rows.find((r) => r.rawId === 'ps');
    expect(hit?.pricingSource).toBe('bundled');
  });
});
