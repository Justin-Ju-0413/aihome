import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanClaude } from '../sources/claude';
import { tmpDir, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';
import { BUNDLED_PRICING, type PricingLookup } from '../pricing';

const lookup = (m: string): PricingLookup => {
  const pricing = BUNDLED_PRICING[m] ?? null;
  return { pricing, source: pricing ? 'bundled' : 'unknown' };
};

let checkpointMtimeAfterFirstScan = 0;

const dir = tmpDir('claude-');
afterAll(() => rmTmp(dir));

const NEW_FORMAT_LINE = JSON.stringify({
  type: 'assistant',
  uuid: 'u1',
  timestamp: '2026-08-01T10:00:00.000Z',
  message: {
    model: 'glm-5.2',
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: 300,
      cache_creation_input_tokens: 50,
    },
  },
});

const OLD_FORMAT_LINE = JSON.stringify({
  type: 'assistant',
  uuid: 'u2',
  timestamp: '2026-08-01T11:00:00.000Z',
  model: 'claude-sonnet-4-5',
  usage: { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

describe('scanClaude', () => {
  it('parses both new and old formats with pricing', () => {
    const sub = path.join(dir, 'proj');
    fs.mkdirSync(sub, { recursive: true });
    const f = path.join(sub, 's1.jsonl');
    fs.writeFileSync(f, `${NEW_FORMAT_LINE}\n${OLD_FORMAT_LINE}\nbroken-line\n`);
    const { events, checkpoint } = scanClaude(dir, EMPTY_CHECKPOINT, lookup);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      rawId: 's1.jsonl:u1', source: 'claude', provider: 'claude-code', model: 'glm-5.2',
      inputTokens: 1000, outputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 50,
      timestamp: 1_785_578_400_000,
    });
    expect(events[0].costUsd).toBeGreaterThan(0);
    expect(events[0].pricingSource).toBe('bundled');
    expect(events[1].pricingSource).toBe('bundled');
    expect(events[1].model).toBe('claude-sonnet-4-5');
    expect(checkpoint.mtime).toBeGreaterThan(0);
    checkpointMtimeAfterFirstScan = checkpoint.mtime;
  });
  it('mtime incremental: skips unmodified files', () => {
    const { events } = scanClaude(dir, { ts: 0, mtime: checkpointMtimeAfterFirstScan }, lookup);
    expect(events).toHaveLength(0);
  });
  it('missing timestamp emits event with timestamp 0', () => {
    const f = path.join(dir, 'no-ts.jsonl');
    fs.writeFileSync(
      f,
      JSON.stringify({
        type: 'assistant',
        uuid: 'u3',
        usage: { input_tokens: 10, output_tokens: 5 },
      }) + '\n'
    );
    const { events } = scanClaude(dir, { ts: 0, mtime: 0 }, lookup);
    const hit = events.find((e) => e.rawId === 'no-ts.jsonl:u3');
    expect(hit).toBeDefined();
    expect(hit?.timestamp).toBe(0);
  });
  it('returns empty when dir missing', () => {
    const r = scanClaude(path.join(dir, 'nope'), EMPTY_CHECKPOINT, lookup);
    expect(r.events).toEqual([]);
  });
});
