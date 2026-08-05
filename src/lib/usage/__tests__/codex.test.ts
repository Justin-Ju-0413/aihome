import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanCodex } from '../sources/codex';
import { tmpDir, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';
import { BUNDLED_PRICING } from '../pricing';

const dir = tmpDir('codex-');
afterAll(() => rmTmp(dir));

const configEvent = JSON.stringify({ type: 'event_msg', payload: { model: 'gpt-5.5' } });
const usageEvent = JSON.stringify({
  type: 'event_msg',
  timestamp: '2026-08-01T12:00:00.000Z',
  payload: {
    type: 'token_count',
    info: {
      last_token_usage: {
        input_tokens: 1000,
        cached_input_tokens: 200,
        output_tokens: 300,
        reasoning_output_tokens: 10,
      },
    },
  },
});
const emptyInfoEvent = JSON.stringify({
  type: 'event_msg',
  timestamp: '2026-08-01T12:05:00.000Z',
  payload: { type: 'token_count', info: null },
});

describe('scanCodex', () => {
  it('parses token_count usage and tracks model from config', () => {
    const sub = path.join(dir, '2026', '08');
    fs.mkdirSync(sub, { recursive: true });
    const f = path.join(sub, 'rollout-1.jsonl');
    fs.writeFileSync(f, `${configEvent}\n${usageEvent}\n${emptyInfoEvent}\nbad-json\n`);
    const { events, checkpoint } = scanCodex(dir, EMPTY_CHECKPOINT, (m) => BUNDLED_PRICING[m] ?? null);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      rawId: 'rollout-1.jsonl:1', source: 'codex', provider: 'codex', model: 'gpt-5.5',
      inputTokens: 1000, outputTokens: 300, cacheReadTokens: 200, cacheWriteTokens: 0,
      timestamp: 1_785_585_600_000,
    });
    expect(events[0].costUsd).toBeGreaterThan(0);
    expect(checkpoint.mtime).toBeGreaterThan(0);
  });
  it('skips files without usage data and missing dirs', () => {
    const { events } = scanCodex(path.join(dir, 'nope'), EMPTY_CHECKPOINT, () => null);
    expect(events).toEqual([]);
  });
});
