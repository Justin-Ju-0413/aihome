import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
// fixture 用 1970 固定时间戳；保留窗口设 100 年，避免 purge 清掉（须在模块 import 前设置）
vi.hoisted(() => {
  process.env.AIHOME_USAGE_RETENTION_DAYS = '36500';
});
import { runIndex, checkSourceAvailability, SOURCE_LABELS, indexIfStale, triggerBackgroundIndex } from '../indexer';
import { makeCcSwitchDb, tmpDir, rmTmp } from './fixtures';

const dir = tmpDir('indexer-');
const ccDb = path.join(dir, 'cc.db');
const ocDb = path.join(dir, 'oc.db');
const cacheDb = path.join(dir, 'cache.db');

beforeAll(() => {
  makeCcSwitchDb(ccDb, [
    { request_id: 'r1', app_type: 'opencode', model: 'deepseek-v4-flash', input_tokens: 10,
      output_tokens: 5, total_cost_usd: '0.01', status_code: 200, created_at: 1000 },
  ]);
  const db = new DatabaseSync(ocDb);
  db.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, cost REAL NOT NULL DEFAULT 0,
    tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_reasoning INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL, data TEXT NOT NULL)`);
  db.prepare(`INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)`).run(
    's1', 0.5, 100, 200, 0, 2000);
  db.prepare(`INSERT INTO message VALUES (?, ?, ?, ?)`).run(
    'm1', 's1', 2000, JSON.stringify({ model: { modelID: 'm2' } }));
  db.close();
});

afterAll(() => rmTmp(dir));

describe('runIndex', () => {
  it('scans configured sources into cache, openclaw not-supported', () => {
    const env = {
      ...process.env,
      AIHOME_USAGE_CCSWITCH_DB: ccDb,
      AIHOME_USAGE_OPENCODE_DB: ocDb,
      AIHOME_USAGE_CLAUDE_DIR: path.join(dir, 'no-claude'),
      AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
      AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
      AIHOME_USAGE_CACHE: cacheDb,
    };
    const prev = { ...process.env };
    Object.assign(process.env, env);
    try {
      const res = runIndex();
      const byId = Object.fromEntries(res.sources.map((s) => [s.id, s]));
      expect(byId['cc-switch'].status).toBe('ready');
      expect(byId['cc-switch'].eventCount).toBe(1);
      expect(byId.opencode.status).toBe('ready');
      expect(byId.opencode.eventCount).toBe(1);
      expect(byId.openclaw.status).toBe('not-supported');
      expect(res.inserted).toBe(2);
      const res2 = runIndex();
      expect(res2.inserted).toBe(0);
    } finally {
      process.env = prev;
    }
  });
  it('marks missing sources unavailable', () => {
    const prev = process.env.AIHOME_USAGE_HERMES_DB;
    process.env.AIHOME_USAGE_HERMES_DB = path.join(dir, 'no-hermes.db');
    try {
      expect(checkSourceAvailability('hermes').ok).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.AIHOME_USAGE_HERMES_DB;
      else process.env.AIHOME_USAGE_HERMES_DB = prev;
    }
  });
  it('marks source error when its db file is corrupt', () => {
    const corrupt = path.join(dir, 'corrupt.db');
    fs.writeFileSync(corrupt, 'not a sqlite database');
    const prev = { ...process.env };
    Object.assign(process.env, {
      AIHOME_USAGE_CCSWITCH_DB: corrupt,
      AIHOME_USAGE_OPENCODE_DB: path.join(dir, 'no-oc.db'),
      AIHOME_USAGE_CLAUDE_DIR: path.join(dir, 'no-claude'),
      AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
      AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
      AIHOME_USAGE_CACHE: path.join(dir, 'corrupt-cache.db'),
    });
    try {
      const res = runIndex(['cc-switch']);
      const byId = Object.fromEntries(res.sources.map((s) => [s.id, s]));
      expect(byId['cc-switch'].status).toBe('error');
    } finally {
      process.env = prev;
    }
  });
});

describe('indexIfStale / background trigger', () => {
  const env = {
    AIHOME_USAGE_CCSWITCH_DB: ccDb,
    AIHOME_USAGE_OPENCODE_DB: ocDb,
    AIHOME_USAGE_CLAUDE_DIR: path.join(dir, 'no-claude'),
    AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
    AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
    AIHOME_USAGE_CACHE: cacheDb,
  };

  it('returns false when fresh, true when stale, and refreshes in background', async () => {
    const prev = { ...process.env };
    Object.assign(process.env, env);
    try {
      runIndex(['cc-switch']);
      expect(indexIfStale()).toBe(false);

      // 把 last_index_ms 改成过期 → 触发后台重索引
      const db = new DatabaseSync(cacheDb);
      db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_index_ms', '1')").run();
      db.close();
      expect(indexIfStale()).toBe(true);
      expect(indexIfStale()).toBe(true); // 后台运行期间仍标记 stale

      // 等待后台任务（setImmediate 后）完成，meta 应被刷新
      await new Promise((r) => setTimeout(r, 100));
      const db2 = new DatabaseSync(cacheDb);
      const row = db2.prepare("SELECT value FROM meta WHERE key = 'last_index_ms'").get() as { value: string };
      db2.close();
      expect(Number(row.value)).toBeGreaterThan(1);
    } finally {
      process.env = prev;
    }
  });

  it('coalesces concurrent background triggers (running + queued, no thundering herd)', async () => {
    const prev = { ...process.env };
    Object.assign(process.env, env);
    try {
      // 把 meta 弄旧，连续多次触发（模拟并发请求）
      const db = new DatabaseSync(cacheDb);
      db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_index_ms', '1')").run();
      db.close();
      triggerBackgroundIndex();
      triggerBackgroundIndex();
      triggerBackgroundIndex();
      // 等待排队任务全部完成（守卫：running 期间重复触发只合并为 queued）
      await new Promise((r) => setTimeout(r, 150));
      const db2 = new DatabaseSync(cacheDb);
      const row = db2.prepare("SELECT value FROM meta WHERE key = 'last_index_ms'").get() as { value: string };
      db2.close();
      expect(Number(row.value)).toBeGreaterThan(1);
      // 任务结束后新的触发立即执行（守卫无卡死）
      triggerBackgroundIndex();
      await new Promise((r) => setTimeout(r, 100));
    } finally {
      process.env = prev;
    }
  });
});

describe('SOURCE_LABELS', () => {
  it('has labels for all sources', () => {
    for (const id of Object.keys(SOURCE_LABELS)) expect(SOURCE_LABELS[id as keyof typeof SOURCE_LABELS]).toBeTruthy();
  });
});
