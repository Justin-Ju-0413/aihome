import { describe, it, expect, afterAll } from 'vitest';
import * as path from 'path';
import { scanCcSwitch } from '../sources/ccswitch';
import { tmpDir, makeCcSwitchDb, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';

const dir = tmpDir('ccswitch-');
afterAll(() => rmTmp(dir));

describe('scanCcSwitch', () => {
  it('reads 200 requests, skips failures, maps fields', () => {
    const dbPath = path.join(dir, 'cc.db');
    makeCcSwitchDb(dbPath, [
      { request_id: 'r1', app_type: 'opencode', model: 'deepseek-v4-flash', input_tokens: 100,
        output_tokens: 50, cache_read_tokens: 10, cache_creation_tokens: 5,
        total_cost_usd: '0.01', latency_ms: 300, session_id: 's1', status_code: 200,
        created_at: 1000 },
      { request_id: 'r2', app_type: 'opencode', model: 'deepseek-v4-flash', input_tokens: 1,
        output_tokens: 1, status_code: 500, created_at: 2000 },
    ]);
    const { events, checkpoint } = scanCcSwitch(dbPath, EMPTY_CHECKPOINT);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      rawId: 'r1', source: 'cc-switch', provider: 'opencode', model: 'deepseek-v4-flash',
      inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5,
      costUsd: 0.01, latencyMs: 300, sessionId: 's1', timestamp: 1_000_000,
    });
    expect(checkpoint.ts).toBe(2000);
  });
  it('incremental: only rows after checkpoint', () => {
    const dbPath = path.join(dir, 'cc2.db');
    makeCcSwitchDb(dbPath, [
      { request_id: 'a', app_type: 'x', model: 'm', created_at: 100 },
      { request_id: 'b', app_type: 'x', model: 'm', created_at: 200 },
    ]);
    const { events } = scanCcSwitch(dbPath, { ts: 150, mtime: 0 });
    expect(events.map((e) => e.rawId)).toEqual(['b']);
  });
  it('returns empty when file missing', () => {
    const { events, checkpoint } = scanCcSwitch(path.join(dir, 'nope.db'), EMPTY_CHECKPOINT);
    expect(events).toEqual([]);
    expect(checkpoint).toEqual(EMPTY_CHECKPOINT);
  });
});
