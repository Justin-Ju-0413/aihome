import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
  it('purges events older than retention window (local time boundaries)', () => {
    // 本地时间构造：91 天前 = 过期；9 天前 = 保留
    // （共享 cache 实例中还有更早用例插入的 1970 时间戳事件，同样会被清理，故用 >= 断言）
    const now = Date.now();
    const day = 24 * 3600_000;
    cache.insertEvents([
      ev('old-1', now - 91 * day),
      ev('old-2', now - 100 * day),
      ev('fresh-1', now - 9 * day),
    ]);
    expect(cache.purgeExpired(now)).toBeGreaterThanOrEqual(2);
    expect(cache.countEvents('cc-switch')).toBe(1);
    const rows = cache.queryEvents(['cc-switch'], now - 30 * day);
    expect(rows.map((r) => r.rawId)).toEqual(['fresh-1']);
  });
});
