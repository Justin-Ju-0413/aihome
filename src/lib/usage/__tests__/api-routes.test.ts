import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { NextRequest } from 'next/server';
import { GET as eventsGet } from '@/app/api/usage/events/route';
import { GET as sourcesGet } from '@/app/api/usage/sources/route';
import { POST as rescanPost } from '@/app/api/usage/rescan/route';
import { makeCcSwitchDb, tmpDir, rmTmp } from './fixtures';

const dir = tmpDir('api-');
const ccDb = path.join(dir, 'cc.db');
const cacheDb = path.join(dir, 'cache.db');
const prev = { ...process.env };

const now = Date.now();
const monthStart = new Date();
monthStart.setDate(1);
monthStart.setHours(0, 0, 0, 0);
const safeTs = Math.max(now - 3600_000, monthStart.getTime() + 5 * 60_000);

beforeAll(() => {
  makeCcSwitchDb(ccDb, [
    { request_id: 'r1', app_type: 'opencode', model: 'deepseek-v4-flash', input_tokens: 10,
      output_tokens: 5, total_cost_usd: '0.01', status_code: 200,
      created_at: Math.floor(safeTs / 1000) },
  ]);
  const db = new DatabaseSync(path.join(dir, 'oc.db'));
  db.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, cost REAL NOT NULL DEFAULT 0,
    tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_reasoning INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL, data TEXT NOT NULL)`);
  db.prepare(`INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)`).run(
    's1', 0.5, 100, 200, 0, safeTs);
  db.prepare(`INSERT INTO message VALUES (?, ?, ?, ?)`).run(
    'm1', 's1', safeTs, JSON.stringify({ model: { modelID: 'm2' } }));
  db.close();
  Object.assign(process.env, {
    AIHOME_USAGE_CCSWITCH_DB: ccDb,
    AIHOME_USAGE_OPENCODE_DB: path.join(dir, 'oc.db'),
    AIHOME_USAGE_CLAUDE_DIR: path.join(dir, 'no-claude'),
    AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
    AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
    AIHOME_USAGE_CACHE: cacheDb,
  });
});

afterAll(() => {
  process.env = prev;
  rmTmp(dir);
});

const makeRequest = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(url, init);

describe('usage API routes', () => {
  it('events: aggregates cached data', async () => {
    await rescanPost(makeRequest('http://localhost/api/usage/rescan', {
      method: 'POST', body: JSON.stringify({}),
    }));
    const res = await eventsGet(makeRequest('http://localhost/api/usage/events?range=24h&source=all&dimension=cost'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totals.requests).toBeGreaterThanOrEqual(1);
    expect(data.totals.month).toBeGreaterThan(0);
    expect(data.kline.length).toBeGreaterThan(0);
    expect(data.table.length).toBeGreaterThanOrEqual(1);
    expect(data.stats.bySource.length).toBeGreaterThanOrEqual(1);
    expect(data.sourceStatus.length).toBe(6);
    const openclaw = data.sourceStatus.find((s: { id: string }) => s.id === 'openclaw');
    expect(openclaw.status).toBe('not-supported');
  });
  it('events: invalid range falls back to default', async () => {
    const res = await eventsGet(makeRequest('http://localhost/api/usage/events?range=bogus'));
    expect(res.status).toBe(200);
  });
  it('events: invalid source falls back to all sources', async () => {
    const res = await eventsGet(makeRequest('http://localhost/api/usage/events?source=bogus'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sourceStatus.length).toBe(6);
    expect(data.totals).toBeDefined();
  });
  it('sources: reports availability without indexing', async () => {
    const res = await sourcesGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources.length).toBe(6);
  });
  it('rescan: validates only param', async () => {
    const res = await rescanPost(makeRequest('http://localhost/api/usage/rescan', {
      method: 'POST', body: JSON.stringify({ only: ['hermes'] }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources.map((s: { id: string }) => s.id)).toContain('hermes');
  });
});
