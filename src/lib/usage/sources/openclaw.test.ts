import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scanOpenclaw } from './openclaw';
import type { Checkpoint } from '../types';

let root: string;
let agentsRoot: string;

const ROLLUP_V2_SCOPE = 'session-cost-usage-rollup-v2';

function rollupValueJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 2,
    pricingFingerprint: 'fp-1',
    checkpoint: { kind: 'sqlite', maxSeq: 10, eventCount: 5, size: 100, mtimeMs: 0, anchorHash: 'h' },
    scannedAt: 1_700_100_000_000,
    parsedRecords: 5,
    countedRecords: 5,
    rollup: {
      buckets: {
        '1700050000000': {
          timestampMs: 1_700_050_000_000,
          totals: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, totalTokens: 165, totalCost: 0.08, inputCost: 0.05, outputCost: 0.02, cacheReadCost: 0.01, cacheWriteCost: 0, missingCostEntries: 0 },
          messageCounts: { total: 4, user: 1, assistant: 2, toolCalls: 1, toolResults: 1, errors: 0 },
          tools: [{ name: 'bash', count: 1 }],
          models: [
            { provider: 'deepseek', model: 'deepseek-v4-flash', count: 3, totals: { input: 90, output: 45, cacheRead: 10, cacheWrite: 5, totalTokens: 150, totalCost: 0.07, inputCost: 0.045, outputCost: 0.018, cacheReadCost: 0.007, cacheWriteCost: 0, missingCostEntries: 0 } },
            { provider: 'anthropic', model: 'claude-sonnet', count: 1, totals: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, totalCost: 0.01, inputCost: 0.005, outputCost: 0.002, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 } },
          ],
          latency: { centroids: [], count: 4, max: 100, sum: 200 },
        },
      },
      lastUserTimestamp: 1_700_050_000_100,
      untimestamped: { totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, totalCost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 }, messageCounts: { total: 0, user: 0, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 }, tools: [], models: [] },
    },
    ...overrides,
  });
}

function makeAgentDb(agentId: string, rows: Array<{ key: string; valueJson: string; updatedAt: number }>): string {
  const dbPath = path.join(agentsRoot, agentId, 'agent', 'openclaw-agent.sqlite');
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE cache_entries (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT,
    blob BLOB,
    expires_at INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (scope, key)
  )`);
  for (const row of rows) {
    db.prepare(
      'INSERT INTO cache_entries (scope, key, value_json, blob, expires_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?)'
    ).run(ROLLUP_V2_SCOPE, row.key, row.valueJson, row.updatedAt);
  }
  db.close();
  return dbPath;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aihome-openclaw-'));
  agentsRoot = path.join(root, 'agents');
  mkdirSync(agentsRoot);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('scanOpenclaw', () => {
  it('parses rollup v2 rows into per-model events with bucket timestamps', () => {
    makeAgentDb('agent-1', [
      { key: 'session-a', valueJson: rollupValueJson(), updatedAt: 1_700_100_000_500 },
    ]);
    const { events, checkpoint } = scanOpenclaw(agentsRoot, { ts: 0, mtime: 0 });
    // 2 个 bucket models + 0 untimestamped models → 2 事件
    expect(events).toHaveLength(2);
    const deepseek = events.find((e) => e.model === 'deepseek-v4-flash')!;
    expect(deepseek).toMatchObject({
      source: 'openclaw',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 90,
      outputTokens: 45,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      costUsd: 0.07,
      timestamp: 1_700_050_000_000,
    });
    expect(deepseek.rawId).toContain('agent-1');
    const claude = events.find((e) => e.model === 'claude-sonnet')!;
    expect(claude.costUsd).toBe(0.01);
    // checkpoint = max(bucket ts, scannedAt)
    expect(checkpoint.ts).toBe(1_700_100_000_000);
    expect(checkpoint.mtime).toBe(1_700_100_000_500);
  });

  it('falls back to untimestamped totals with scannedAt when bucket has no models', () => {
    makeAgentDb('agent-2', [
      { key: 'session-b', valueJson: rollupValueJson({ rollup: { buckets: {}, lastUserTimestamp: undefined, untimestamped: { totals: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 10, totalCost: 0.001, inputCost: 0, outputCost: 0.001, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 }, messageCounts: { total: 1, user: 0, assistant: 1, toolCalls: 0, toolResults: 0, errors: 0 }, tools: [], models: [] } } }), updatedAt: 1_700_100_000_600 },
    ]);
    const { events } = scanOpenclaw(agentsRoot, { ts: 0, mtime: 0 });
    expect(events).toHaveLength(1);
    expect(events[0].model).toBe('unknown');
    expect(events[0].costUsd).toBe(0.001);
    expect(events[0].timestamp).toBe(1_700_100_000_000); // scannedAt
  });

  it('skips rows with mismatched version', () => {
    makeAgentDb('agent-3', [
      { key: 'session-c', valueJson: rollupValueJson({ version: 1 }), updatedAt: 1 },
    ]);
    const { events } = scanOpenclaw(agentsRoot, { ts: 0, mtime: 0 });
    expect(events).toHaveLength(0);
  });

  it('returns empty when agents root has no databases', () => {
    const { events, checkpoint } = scanOpenclaw(agentsRoot, { ts: 0, mtime: 0 });
    expect(events).toHaveLength(0);
    expect(checkpoint.ts).toBe(0);
  });

  it('respects checkpoint ts (incremental scan)', () => {
    makeAgentDb('agent-1', [
      { key: 'session-a', valueJson: rollupValueJson(), updatedAt: 1_700_100_000_500 },
    ]);
    const cp: Checkpoint = { ts: 1_700_100_000_000, mtime: 1_700_100_000_500 };
    const { events } = scanOpenclaw(agentsRoot, cp);
    // checkpoint.ts >= max bucket ts → 不产生新事件（updated_at 相同）
    expect(events).toHaveLength(0);
  });
});
