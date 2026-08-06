import { describe, it, expect, afterAll } from 'vitest';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { scanOpencode } from '../sources/opencode';
import { tmpDir, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';

const dir = tmpDir('opencode-');
afterAll(() => rmTmp(dir));

function makeDb(p: string): void {
  const db = new DatabaseSync(p);
  db.exec(
    `CREATE TABLE session (
       id TEXT PRIMARY KEY, title TEXT, cost REAL NOT NULL DEFAULT 0,
       tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
       tokens_reasoning INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL) ;
     CREATE TABLE message (
       id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL,
       data TEXT NOT NULL)`
  );
  db.prepare(
    `INSERT INTO session (id, title, cost, tokens_input, tokens_output, tokens_reasoning, time_created)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('s1', 'task', 0.123, 1000, 500, 50, 1_782_504_000_000);
  db.prepare('INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)').run(
    'm1', 's1', 1_782_504_000_000,
    JSON.stringify({ model: { providerID: 'opencode', modelID: 'deepseek-v4-flash' } })
  );
  db.close();
}

describe('scanOpencode', () => {
  it('maps session rows with model from first message', () => {
    const dbPath = path.join(dir, 'oc.db');
    makeDb(dbPath);
    const { events, checkpoint } = scanOpencode(dbPath, EMPTY_CHECKPOINT);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      rawId: 's1', source: 'opencode', provider: 'opencode', model: 'deepseek-v4-flash',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0,
      costUsd: 0.123, timestamp: 1_782_504_000_000,
    });
    expect(checkpoint.ts).toBe(1_782_504_000_000);
  });
  it('incremental by time_created with boundary inclusion', () => {
    const dbPath = path.join(dir, 'oc2.db');
    makeDb(dbPath);
    const atBoundary = scanOpencode(dbPath, { ts: 1_782_504_000_000, mtime: 0 });
    expect(atBoundary.events.map((e) => e.rawId)).toEqual(['s1']);
    const after = scanOpencode(dbPath, { ts: 1_782_504_000_001, mtime: 0 });
    expect(after.events).toEqual([]);
  });
  it('returns empty when file missing', () => {
    expect(scanOpencode(path.join(dir, 'nope.db'), EMPTY_CHECKPOINT).events).toEqual([]);
  });
});
