import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { runIndex, checkSourceAvailability, SOURCE_LABELS } from '../indexer';
import { UsageCache } from '../cache';
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
      AIHOME_USAGE_PRICING_OVERRIDES: path.join(dir, 'no-overrides.json'),
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
      AIHOME_USAGE_PRICING_OVERRIDES: path.join(dir, 'no-overrides.json'),
    });
    try {
      const res = runIndex(['cc-switch']);
      const byId = Object.fromEntries(res.sources.map((s) => [s.id, s]));
      expect(byId['cc-switch'].status).toBe('error');
    } finally {
      process.env = prev;
    }
  });
  it('stamps pricingSource on claude events, tolerates missing override file', () => {
    const claudeDir = path.join(dir, 'claude-ps');
    fs.mkdirSync(path.join(claudeDir, 'proj'), { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'proj', 's1.jsonl'),
      JSON.stringify({ type: 'assistant', uuid: 'u1', timestamp: '2026-08-01T10:00:00.000Z',
        message: { model: 'glm-5.2', usage: { input_tokens: 100, output_tokens: 50 } } }) + '\n' +
      JSON.stringify({ type: 'assistant', uuid: 'u2', timestamp: '2026-08-01T11:00:00.000Z',
        message: { model: 'mystery-x', usage: { input_tokens: 10, output_tokens: 5 } } }) + '\n'
    );
    const prev = { ...process.env };
    Object.assign(process.env, {
      AIHOME_USAGE_CCSWITCH_DB: path.join(dir, 'no-cc.db'),
      AIHOME_USAGE_OPENCODE_DB: path.join(dir, 'no-oc.db'),
      AIHOME_USAGE_CLAUDE_DIR: claudeDir,
      AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
      AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
      AIHOME_USAGE_CACHE: path.join(dir, 'cache-ps.db'),
      AIHOME_USAGE_PRICING_OVERRIDES: path.join(dir, 'no-overrides.json'),
    });
    try {
      runIndex(['claude']);
      const cache = UsageCache.open(path.join(dir, 'cache-ps.db'));
      try {
        const rows = cache.queryEvents(['claude'], 0);
        const byModel = Object.fromEntries(rows.map((r) => [r.model, r]));
        expect(byModel['glm-5.2'].pricingSource).toBe('bundled');
        expect(byModel['mystery-x'].pricingSource).toBe('unknown');
        expect(byModel['mystery-x'].costUsd).toBe(0);
      } finally {
        cache.close();
      }
    } finally {
      process.env = prev;
    }
  });
  it('backfills pricingSource on pre-existing rows with NULL pricing_source', () => {
    // Pre-seed a cache with rows lacking pricingSource (NULL pricing_source),
    // as would exist from an index run before the pricing_source migration.
    const cachePath = path.join(dir, 'cache-backfill.db');
    const seed = UsageCache.open(cachePath);
    try {
      seed.insertEvents([
        { rawId: 'pre1', source: 'claude', provider: 'claude-code', model: 'glm-5.2',
          inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0,
          costUsd: 0, timestamp: 1000 },
        { rawId: 'pre2', source: 'claude', provider: 'claude-code', model: 'mystery-backfill',
          inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0,
          costUsd: 0, timestamp: 1001 },
      ]);
    } finally {
      seed.close();
    }
    const prev = { ...process.env };
    Object.assign(process.env, {
      AIHOME_USAGE_CCSWITCH_DB: path.join(dir, 'no-cc.db'),
      AIHOME_USAGE_OPENCODE_DB: path.join(dir, 'no-oc.db'),
      AIHOME_USAGE_CLAUDE_DIR: path.join(dir, 'no-claude-backfill'),
      AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
      AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
      AIHOME_USAGE_CACHE: cachePath,
      AIHOME_USAGE_PRICING_OVERRIDES: path.join(dir, 'no-overrides.json'),
    });
    try {
      runIndex(['claude']);
      const cache = UsageCache.open(cachePath);
      try {
        const rows = cache.queryEvents(['claude'], 0);
        const byId = Object.fromEntries(rows.map((r) => [r.rawId, r]));
        expect(byId['pre1'].pricingSource).toBe('bundled');
        expect(byId['pre2'].pricingSource).toBe('unknown');
      } finally {
        cache.close();
      }
    } finally {
      process.env = prev;
    }
  });
  it('consumes AIHOME_USAGE_PRICING_OVERRIDES override for scanned events', () => {
    const claudeDir = path.join(dir, 'claude-ovr');
    fs.mkdirSync(path.join(claudeDir, 'proj'), { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'proj', 's1.jsonl'),
      JSON.stringify({ type: 'assistant', uuid: 'u1', timestamp: '2026-08-01T10:00:00.000Z',
        message: { model: 'glm-5.2', usage: { input_tokens: 100, output_tokens: 50 } } }) + '\n'
    );
    const overridesPath = path.join(dir, 'overrides.json');
    fs.writeFileSync(
      overridesPath,
      JSON.stringify({
        'glm-5.2': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 0, cacheWritePerM: 0 },
      })
    );
    const prev = { ...process.env };
    Object.assign(process.env, {
      AIHOME_USAGE_CCSWITCH_DB: path.join(dir, 'no-cc.db'),
      AIHOME_USAGE_OPENCODE_DB: path.join(dir, 'no-oc.db'),
      AIHOME_USAGE_CLAUDE_DIR: claudeDir,
      AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
      AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
      AIHOME_USAGE_CACHE: path.join(dir, 'cache-ovr.db'),
      AIHOME_USAGE_PRICING_OVERRIDES: overridesPath,
    });
    try {
      runIndex(['claude']);
      const cache = UsageCache.open(path.join(dir, 'cache-ovr.db'));
      try {
        const rows = cache.queryEvents(['claude'], 0);
        const byModel = Object.fromEntries(rows.map((r) => [r.model, r]));
        expect(byModel['glm-5.2'].pricingSource).toBe('override');
        // override price: (100 * 1 + 50 * 2) / 1e6 = 0.0002
        expect(byModel['glm-5.2'].costUsd).toBeCloseTo((100 * 1 + 50 * 2) / 1e6, 10);
      } finally {
        cache.close();
      }
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
