import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { runIndex, checkSourceAvailability, SOURCE_LABELS } from '../indexer';
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
});

describe('SOURCE_LABELS', () => {
  it('has labels for all sources', () => {
    for (const id of Object.keys(SOURCE_LABELS)) expect(SOURCE_LABELS[id as keyof typeof SOURCE_LABELS]).toBeTruthy();
  });
});
