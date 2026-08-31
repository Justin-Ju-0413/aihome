import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDb, resetDbForTests } from '../db';
import { initDefaults } from '../settings';
import { emitEvent, onEvent } from '../events';
import * as processRegistry from '../process-registry';
import { launch, nextFallbackProvider } from '../orchestrator';

/**
 * fallback 链断裂回归测试：
 * 1) 链必须单向消费，到链尾即终止（不得 claude↔codex 无限循环）
 * 2) agent(claude/codex) 失败必须触发回退（此前只有 hermes 路径有 fallback）
 * 3) 回退必须复用同一 runId（输出缓冲/前端轮询连续），旧条目不得残留
 */

// mock agent-runner：不真正 spawn，由测试手动 emit agent:* 事件模拟生命周期
vi.mock('../agent-runner', () => {
  let seq = 0;
  return {
    activeProcesses: new Map(),
    createAgent: vi.fn((input: { provider: string }) => `agent-${input.provider}-${++seq}`),
    startAgent: vi.fn(() => 12345),
    stopAgent: vi.fn(() => true),
  };
});

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-orchestrator-test-'));

describe('fallback chain consumption', () => {
  it('walks the chain forward and stops at the tail (no A↔B loop)', () => {
    expect(nextFallbackProvider(['claude', 'codex'], 'claude')).toBe('codex');
    // 链尾：终止，不回弹到 claude
    expect(nextFallbackProvider(['claude', 'codex'], 'codex')).toBeNull();
    expect(nextFallbackProvider(['hermes', 'claude', 'codex'], 'hermes')).toBe('claude');
    expect(nextFallbackProvider(['hermes', 'claude', 'codex'], 'claude')).toBe('codex');
    expect(nextFallbackProvider(['hermes', 'claude', 'codex'], 'codex')).toBeNull();
    expect(nextFallbackProvider(['claude'], 'claude')).toBeNull();
    // provider 不在链中：终止
    expect(nextFallbackProvider(['claude', 'codex'], 'hermes')).toBeNull();
  });
});

describe('orchestrator fallback wiring', () => {
  const unified: Array<Record<string, unknown>> = [];
  let off: () => void;

  beforeEach(() => {
    resetDbForTests();
    process.env.AIHOME_FV_DB = path.join(DB_DIR, 'orchestrator.db');
    process.env.AIHOME_FV_LEGACY_DB = path.join(DB_DIR, 'no-legacy.db');
    getDb();
    initDefaults();
    for (const e of processRegistry.list()) processRegistry.unregister(e.id);
    unified.length = 0;
    off = onEvent((e) => {
      if (e.type.startsWith('unified:')) {
        unified.push({ type: e.type, runId: e.runId, provider: e.provider, fromProvider: e.fromProvider, toProvider: e.toProvider, status: e.status });
      }
    });
  });

  afterEach(() => {
    off();
    resetDbForTests();
    delete process.env.AIHOME_FV_DB;
    delete process.env.AIHOME_FV_LEGACY_DB;
    for (const e of processRegistry.list()) processRegistry.unregister(e.id);
  });

  const agentIdOf = (runId: string): string => {
    const entry = processRegistry.get(runId);
    if (!entry) throw new Error(`run ${runId} not in registry`);
    return String(entry.metadata?.agentId);
  };

  it('falls back from claude to codex on agent spawn failure, reusing runId', () => {
    const result = launch({ task: 'review the code', provider: 'claude' });
    expect(result.error).toBeUndefined();
    const runId = result.runId;

    let entry = processRegistry.get(runId)!;
    expect(entry.provider).toBe('claude');
    expect(entry.fallbackChain).toEqual(['claude', 'codex']);
    const firstAgent = agentIdOf(runId);

    // 模拟 claude spawn 失败
    emitEvent({ type: 'agent:error', agentId: firstAgent, error: 'ENOENT' });

    entry = processRegistry.get(runId)!;
    expect(entry).toBeDefined();
    expect(entry.provider).toBe('codex'); // 已回退
    expect(agentIdOf(runId)).not.toBe(firstAgent); // 新 agent 接管
    expect(unified.some(
      (u) => u.type === 'unified:fallback' && u.runId === runId && u.fromProvider === 'claude' && u.toProvider === 'codex'
    )).toBe(true);
  });

  it('terminates at chain tail instead of looping claude↔codex forever', () => {
    const result = launch({ task: 'do something', provider: 'codex' }); // chain: [codex, claude]
    const runId = result.runId;
    expect(processRegistry.get(runId)!.fallbackChain).toEqual(['codex', 'claude']);

    // codex 失败 → 回退 claude
    emitEvent({ type: 'agent:error', agentId: agentIdOf(runId), error: 'boom' });
    expect(processRegistry.get(runId)!.provider).toBe('claude');
    expect(unified.filter((u) => u.type === 'unified:fallback')).toHaveLength(1);

    // claude 再失败 → 链尾终止，不再回弹 codex
    emitEvent({ type: 'agent:error', agentId: agentIdOf(runId), error: 'boom again' });
    expect(processRegistry.get(runId)).toBeUndefined(); // 已清理，不残留
    expect(unified.filter((u) => u.type === 'unified:fallback')).toHaveLength(1); // 只有一次回退
    expect(unified.some((u) => u.type === 'unified:completed' && u.runId === runId && u.status === 'error')).toBe(true);
  });

  it('falls back on agent:complete error (non-zero exit close path)', () => {
    const result = launch({ task: 'fix the bug', provider: 'claude' });
    const runId = result.runId;

    // 真实失败路径：进程非零退出 → close → agent:complete error
    emitEvent({ type: 'agent:complete', agentId: agentIdOf(runId), status: 'error', code: 1 });

    expect(processRegistry.get(runId)!.provider).toBe('codex');
    expect(unified.some((u) => u.type === 'unified:fallback' && u.fromProvider === 'claude' && u.toProvider === 'codex')).toBe(true);
  });

  it('emits unified:completed for successful agent runs and cleans up', () => {
    const result = launch({ task: 'write a test', provider: 'claude' });
    const runId = result.runId;

    emitEvent({ type: 'agent:complete', agentId: agentIdOf(runId), status: 'completed', code: 0 });

    expect(processRegistry.get(runId)).toBeUndefined();
    expect(unified.some((u) => u.type === 'unified:completed' && u.runId === runId && u.status === 'completed')).toBe(true);
  });

  it('ignores late close events from a superseded agent (stale agentId)', () => {
    const result = launch({ task: 'do something', provider: 'claude' });
    const runId = result.runId;
    const staleAgent = agentIdOf(runId);

    // 回退到 codex 后，旧 claude agent 的 close 事件晚到
    emitEvent({ type: 'agent:error', agentId: staleAgent, error: 'ENOENT' });
    expect(processRegistry.get(runId)!.provider).toBe('codex');
    const eventsBefore = unified.length;

    emitEvent({ type: 'agent:complete', agentId: staleAgent, status: 'error', code: 1 });
    // 晚到事件不得干扰新 run 状态
    expect(processRegistry.get(runId)!.provider).toBe('codex');
    expect(unified.length).toBe(eventsBefore);
  });
});
