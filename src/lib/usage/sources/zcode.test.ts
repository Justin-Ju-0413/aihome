import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanZcode } from './zcode';
import type { Checkpoint } from '../types';
import type { ModelPricing } from '../pricing';

let root: string;
let dir: string;

const PRICING: ModelPricing = { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 };
const pricing = () => PRICING;

function writeLine(rel: string, line: Record<string, unknown>) {
  writeFileSync(path.join(dir, rel), JSON.stringify(line) + '\n', { flag: 'a' });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aihome-zcode-'));
  dir = path.join(root, 'rollout');
  mkdirSync(dir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('scanZcode', () => {
  it('parses rollout jsonl lines into per-request events', () => {
    writeLine('model-io-sess_a.jsonl', {
      completedAt: '2026-08-13T16:50:22.721Z',
      requestId: 'req-1',
      model: { modelId: 'deepseek-v4-flash', providerId: 'p1' },
      response: { usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 0, totalTokens: 160 } },
    });
    writeLine('model-io-sess_a.jsonl', {
      completedAt: '2026-08-13T16:51:00.000Z',
      requestId: 'req-2',
      model: { modelId: 'claude-sonnet-4-5', providerId: 'p2' },
      response: { usage: { inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 5, totalTokens: 305 } },
    });
    writeLine('model-io-sess_a.jsonl', {
      completedAt: '2026-08-13T16:52:00.000Z',
      requestId: 'req-3',
      model: { modelId: 'no-usage-model' },
      response: {},
    });

    const { events, checkpoint } = scanZcode(dir, { ts: 0, mtime: 0 }, pricing);
    expect(events).toHaveLength(2);
    const first = events.find((e) => e.rawId.includes('req-1'))!;
    expect(first).toMatchObject({
      source: 'zcode',
      provider: 'p1',
      model: 'deepseek-v4-flash',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 0,
      timestamp: Date.parse('2026-08-13T16:50:22.721Z'),
    });
    expect(first.costUsd).toBeGreaterThan(0);
    expect(checkpoint.ts).toBe(Date.parse('2026-08-13T16:51:00.000Z'));
  });

  it('respects mtime checkpoint (incremental scan)', () => {
    writeLine('model-io-sess_b.jsonl', {
      completedAt: '2026-08-13T16:50:22.721Z',
      requestId: 'req-1',
      model: { modelId: 'm' },
      response: { usage: { inputTokens: 1, outputTokens: 1 } },
    });
    const first = scanZcode(dir, { ts: 0, mtime: 0 }, pricing);
    expect(first.events).toHaveLength(1);

    const cp: Checkpoint = first.checkpoint;
    const second = scanZcode(dir, cp, pricing);
    expect(second.events).toHaveLength(0);
  });

  it('returns empty when dir missing', () => {
    const { events, checkpoint } = scanZcode(path.join(root, 'missing'), { ts: 0, mtime: 0 }, pricing);
    expect(events).toHaveLength(0);
    expect(checkpoint).toEqual({ ts: 0, mtime: 0 });
  });
});
