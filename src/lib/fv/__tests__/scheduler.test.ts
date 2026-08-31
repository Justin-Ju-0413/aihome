import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDb, resetDbForTests, stmts } from '../db';
import { initDefaults } from '../settings';
import { getFallbackChain, estimateTaskSize, selectModel, getHistoryBias } from '../scheduler';

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-scheduler-test-'));

beforeEach(() => {
  resetDbForTests();
  process.env.AIHOME_FV_DB = path.join(DB_DIR, 'scheduler.db');
  process.env.AIHOME_FV_LEGACY_DB = path.join(DB_DIR, 'no-legacy.db');
  getDb();
  initDefaults();
});

afterEach(() => {
  resetDbForTests();
  delete process.env.AIHOME_FV_DB;
  delete process.env.AIHOME_FV_LEGACY_DB;
});

describe('fv scheduler', () => {
  it('builds fallback chains without cycles', () => {
    expect(getFallbackChain('claude')).toEqual(['claude', 'codex']);
    expect(getFallbackChain('codex')).toEqual(['codex', 'claude']);
    // hermes -> claude -> codex（最多 3 跳）
    const hermesChain = getFallbackChain('hermes');
    expect(hermesChain[0]).toBe('hermes');
    expect(hermesChain[hermesChain.length - 1]).toBe('codex');
    expect(new Set(hermesChain).size).toBe(hermesChain.length);
  });

  it('estimates task size by character count', () => {
    expect(estimateTaskSize('短')).toBe('small');
    expect(estimateTaskSize('x'.repeat(200))).toBe('medium');
    expect(estimateTaskSize('x'.repeat(600))).toBe('large');
    expect(estimateTaskSize('x'.repeat(3000))).toBe('xlarge');
  });

  it('selects default models per provider', () => {
    expect(selectModel('任务', 'claude')).toBe('claude-sonnet-4-20250514');
    expect(selectModel('任务', 'codex')).toBe('codex-mini');
  });

  it('computes history bias only after >=3 runs', () => {
    for (let i = 0; i < 2; i++) {
      stmts.insertAgent({
        id: `c${i}`, name: 'n', provider: 'claude', status: 'completed', description: '', target: '',
        cwd: '/', prompt: '', totalSteps: 0, pipelineId: null, pipelineOrder: 0, nextAgentId: null,
      });
    }
    expect(getHistoryBias()).toEqual({});

    stmts.insertAgent({
      id: 'c2', name: 'n', provider: 'claude', status: 'completed', description: '', target: '',
      cwd: '/', prompt: '', totalSteps: 0, pipelineId: null, pipelineOrder: 0, nextAgentId: null,
    });
    // 3 次全成功 → (1 - 0.5) * 0.2 = 0.1
    expect(getHistoryBias().claude).toBeCloseTo(0.1);
  });
});
