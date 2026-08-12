import { describe, it, expect, afterAll } from 'vitest';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { scanHermes } from '../sources/hermes';
import { tmpDir, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';

const dir = tmpDir('hermes-');
afterAll(() => rmTmp(dir));

function makeDb(p: string): void {
  const db = new DatabaseSync(p);
  db.exec(
    `CREATE TABLE sessions (
       id TEXT PRIMARY KEY, source TEXT, model TEXT, started_at REAL,
       input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
       cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
       estimated_cost_usd REAL, actual_cost_usd REAL)`
  );
  db.prepare(
    `INSERT INTO sessions (id, source, model, started_at, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, estimated_cost_usd, actual_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('h1', 'cli', 'qwen3.5-9b-optiq', 1780085816.60767, 100, 20, 5, 2, 0, 0.05);
  db.close();
}

describe('scanHermes', () => {
  it('maps session rows, falls back to actual cost', () => {
    const dbPath = path.join(dir, 'h.db');
    makeDb(dbPath);
    const { events, checkpoint } = scanHermes(dbPath, EMPTY_CHECKPOINT);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      rawId: 'h1', source: 'hermes', provider: 'cli', model: 'qwen3.5-9b-optiq',
      inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 2,
      costUsd: 0.05, timestamp: 1_780_085_816_607,
    });
    expect(checkpoint.ts).toBeGreaterThan(0);
  });
  it('returns empty when file missing', () => {
    expect(scanHermes(path.join(dir, 'nope.db'), EMPTY_CHECKPOINT).events).toEqual([]);
  });
  it('prefers estimated cost when present', () => {
    const dbPath = path.join(dir, 'est.db');
    const db = new DatabaseSync(dbPath);
    db.exec(
      `CREATE TABLE sessions (
         id TEXT PRIMARY KEY, source TEXT, model TEXT, started_at REAL,
         input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
         cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
         estimated_cost_usd REAL, actual_cost_usd REAL)`
    );
    db.prepare(
      `INSERT INTO sessions (id, source, model, started_at, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, estimated_cost_usd, actual_cost_usd)
       VALUES ('h2', 'cli', 'qwen3.5-9b-optiq', 1780085816.60767, 10, 5, 0, 0, 0.5, 0.05)`
    ).run();
    db.close();
    const { events } = scanHermes(dbPath, EMPTY_CHECKPOINT);
    expect(events[0].costUsd).toBe(0.5);
  });
  it('respects ts checkpoint: skips older sessions, scans newer ones', () => {
    const dbPath = path.join(dir, 'cp.db');
    const db = new DatabaseSync(dbPath);
    db.exec(
      `CREATE TABLE sessions (
         id TEXT PRIMARY KEY, source TEXT, model TEXT, started_at REAL,
         input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
         cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
         estimated_cost_usd REAL, actual_cost_usd REAL)`
    );
    const insert = (id: string, startedAt: number) =>
      db.prepare(
        `INSERT INTO sessions (id, source, model, started_at, input_tokens, output_tokens,
           cache_read_tokens, cache_write_tokens, estimated_cost_usd, actual_cost_usd)
         VALUES (?, 'cli', 'm', ?, 1, 1, 0, 0, NULL, 0.01)`
      ).run(id, startedAt);
    insert('old', 1_000_000);
    insert('new', 1_780_085_816);
    db.close();

    const first = scanHermes(dbPath, EMPTY_CHECKPOINT);
    expect(first.events.map((e) => e.rawId).sort()).toEqual(['new', 'old']);
    // 用第一次的 checkpoint 再扫：`>=` 语义下边界行重扫（幂等性由 cache 层去重兜底）
    const second = scanHermes(dbPath, first.checkpoint);
    expect(second.events.map((e) => e.rawId)).toEqual(['new']);
    // 新增更晚 session → 扫到边界行 + 新行
    const db2 = new DatabaseSync(dbPath);
    db2.prepare(
      `INSERT INTO sessions (id, source, model, started_at, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, estimated_cost_usd, actual_cost_usd)
       VALUES ('newer', 'cli', 'm', ?, 1, 1, 0, 0, NULL, 0.02)`
    ).run(1_780_085_817);
    db2.close();
    const third = scanHermes(dbPath, first.checkpoint);
    expect(third.events.map((e) => e.rawId).sort()).toEqual(['new', 'newer']);
  });
});
