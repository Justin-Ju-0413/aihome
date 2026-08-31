import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanDsh } from './dsh';
import type { Checkpoint } from '../types';
import type { ModelPricing } from '../pricing';

let root: string;
let storePath: string;

const PRICING: ModelPricing = { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 };
const pricing = () => PRICING;

function writeStore(sessions: Record<string, unknown>) {
  writeFileSync(storePath, JSON.stringify({ tables: { sessions } }));
  const now = new Date();
  utimesSync(storePath, now, now);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aihome-dsh-'));
  const dshDir = path.join(root, '.dsh');
  const storages = path.join(dshDir, 'storages');
  mkdirSync(storages, { recursive: true });
  writeFileSync(path.join(dshDir, 'settings.yaml'), [
    'agent-default-model:',
    '  provider: opencode-go',
    '  model: deepseek-v4-flash',
    '  reasoningEffort: max',
  ].join('\n') + '\n');
  storePath = path.join(storages, 'session_projcache.json');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('scanDsh', () => {
  it('parses sessions with token totals and default model', () => {
    writeStore({
      'session-1': {
        identity: { createdAt: 1786639372130 },
        rows: {
          tokenUsage: { val: { totals: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 0 } } },
        },
      },
      'session-2': {
        identity: { createdAt: 1786639536799 },
        rows: {
          tokenUsage: { val: { totals: { uncachedInputTokens: 200, outputTokens: 80, cacheReadTokens: 20, cacheWriteTokens: 5 } } },
        },
      },
      'session-no-usage': {
        identity: { createdAt: 1786639600000 },
        rows: {},
      },
    });

    const { events, checkpoint } = scanDsh(storePath, { ts: 0, mtime: 0 }, pricing);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      source: 'dsh',
      provider: 'dsh',
      model: 'deepseek-v4-flash',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 0,
      timestamp: 1786639372130,
    });
    expect(events[0].costUsd).toBeGreaterThan(0);
    expect(checkpoint.ts).toBe(1786639536799);
  });

  it('skips unchanged store via mtime checkpoint', () => {
    writeStore({
      'session-1': {
        identity: { createdAt: 1786639372130 },
        rows: {
          tokenUsage: { val: { totals: { uncachedInputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } } },
        },
      },
    });
    const first = scanDsh(storePath, { ts: 0, mtime: 0 }, pricing);
    expect(first.events).toHaveLength(1);

    const cp: Checkpoint = first.checkpoint;
    const second = scanDsh(storePath, cp, pricing);
    expect(second.events).toHaveLength(0);
  });

  it('returns empty when store missing', () => {
    const { events, checkpoint } = scanDsh(path.join(root, 'missing.json'), { ts: 0, mtime: 0 }, pricing);
    expect(events).toHaveLength(0);
    expect(checkpoint).toEqual({ ts: 0, mtime: 0 });
  });
});
