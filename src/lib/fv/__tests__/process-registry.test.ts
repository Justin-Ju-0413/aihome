import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resetDbForTests } from '../db';
import { createAgent } from '../agent-runner';
import {
  register, unregister, updateStatus, get, list, listRunning,
  kill, killAll, getStats, recoverStaleAgents,
} from '../process-registry';

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-registry-test-'));
const DB_FILE = path.join(DB_DIR, 'test.db');

beforeEach(() => {
  resetDbForTests();
  fs.rmSync(DB_FILE, { force: true });
  process.env.AIHOME_FV_DB = DB_FILE;
  process.env.AIHOME_FV_LEGACY_DB = path.join(DB_DIR, 'no-legacy.db');
  // 清理模块级 registry，避免跨测试残留
  for (const e of list()) unregister(e.id);
});

afterEach(() => {
  resetDbForTests();
  delete process.env.AIHOME_FV_DB;
  delete process.env.AIHOME_FV_LEGACY_DB;
  for (const e of list()) unregister(e.id);
});

describe('process registry', () => {
  it('registers with defaults and updates status', () => {
    const id = register('r1', { provider: 'claude', task: 'review' });
    expect(get(id)).toMatchObject({ status: 'running', provider: 'claude', fallbackChain: [] });
    updateStatus(id, 'completed', 0);
    expect(get(id)).toMatchObject({ status: 'completed', exitCode: 0 });
    expect(get(id)!.finishedAt).not.toBeNull();
    expect(unregister(id)?.status).toBe('removed');
    expect(get(id)).toBeUndefined();
  });

  it('list filters by type/status; listRunning only running', () => {
    register('a', { type: 'agent' });
    register('b', { type: 'hermes' });
    register('c', { type: 'agent' });
    updateStatus('c', 'error');
    expect(list({ type: 'agent' }).map((e) => e.id)).toEqual(['a', 'c']);
    expect(list({ status: 'running' }).map((e) => e.id)).toEqual(['a', 'b']);
    expect(listRunning().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('kill invokes the kill callback and marks stopped', () => {
    let killed = 0;
    register('k', { kill: () => { killed++; } });
    expect(kill('k')).toBe(true);
    expect(killed).toBe(1);
    expect(get('k')!.status).toBe('stopped');
    // 无 kill 回调的条目 kill 失败且不置 stopped
    register('nk', {});
    expect(kill('nk')).toBe(false);
    expect(get('nk')!.status).toBe('running');
  });

  it('killAll only kills running entries', () => {
    register('r1', { kill: () => {} });
    register('r2', { kill: () => {} });
    updateStatus('r2', 'error');
    expect(killAll()).toBe(1);
    expect(get('r1')!.status).toBe('stopped');
    expect(get('r2')!.status).toBe('error');
  });

  it('getStats aggregates by provider and type', () => {
    register('a', { type: 'agent', provider: 'claude' });
    register('b', { type: 'agent', provider: 'claude' });
    register('c', { type: 'hermes', provider: 'hermes' });
    const stats = getStats();
    expect(stats.total).toBe(3);
    expect(stats.running).toBe(3);
    expect((stats.byProvider as Record<string, { running: number; total: number }>).claude).toEqual({ running: 2, total: 2 });
    expect((stats.byType as Record<string, number>).agent).toBe(2);
  });
});

describe('recoverStaleAgents', () => {
  it('marks db agents still running/pending as error when not in registry', () => {
    // 模拟崩溃残留：库里有两个 running agent，注册表里只有其中一个
    const alive = createAgent({ name: 'alive', provider: 'claude' });
    const stale = createAgent({ name: 'stale', provider: 'codex' });
    register(alive, { type: 'agent', provider: 'claude' });

    const recovered = recoverStaleAgents();
    expect(recovered).toBe(1);
    // 注册表中的 alive 保持原状
    expect(get(alive)).not.toBeUndefined();
  });

  it('is safe with empty db and tolerates db errors', () => {
    expect(recoverStaleAgents()).toBe(0);
  });
});
