import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'child_process';
import { createAgent, startAgent, stopAgent } from '../agent-runner';
import { resetDbForTests, stmts } from '../db';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-runner-test-'));

function fakeProc() {
  const p = new EventEmitter() as EventEmitter & { pid: number; kill: ReturnType<typeof vi.fn>; stdout: EventEmitter; stderr: EventEmitter };
  p.pid = 4242;
  p.kill = vi.fn(() => true);
  p.stdout = new EventEmitter();
  p.stderr = new EventEmitter();
  return p;
}

beforeEach(() => {
  resetDbForTests();
  process.env.AIHOME_FV_DB = path.join(TMP, 'runner.db');
  process.env.AIHOME_FV_LEGACY_DB = path.join(TMP, 'no-legacy.db');
  delete (globalThis as Record<string, unknown>)['__fvInitDone__'];
  vi.mocked(spawn).mockReset();
});

afterEach(() => {
  resetDbForTests();
  delete process.env.AIHOME_FV_DB;
  delete process.env.AIHOME_FV_LEGACY_DB;
  delete (globalThis as Record<string, unknown>)['__fvInitDone__'];
});

describe('stopAgent vs close race', () => {
  it('keeps status stopped after close fires late (not overwritten to completed)', () => {
    const proc = fakeProc();
    vi.mocked(spawn).mockReturnValue(proc as never);

    const id = createAgent({ name: 't1', provider: 'codex', prompt: 'hi' });
    startAgent(id);
    expect(stmts.getAgent(id)?.status).toBe('running');

    // 用户停止：SIGTERM 已发，状态置 stopped
    expect(stopAgent(id)).toBe(true);
    expect(stmts.getAgent(id)?.status).toBe('stopped');

    // 进程随后真正退出（close 晚到）——状态必须保持 stopped，不得被覆盖为 completed/error
    proc.emit('close', 0);
    expect(stmts.getAgent(id)?.status).toBe('stopped');
  });

  it('normal exit still marks completed when not stopped', () => {
    const proc = fakeProc();
    vi.mocked(spawn).mockReturnValue(proc as never);

    const id = createAgent({ name: 't2', provider: 'codex', prompt: 'hi' });
    startAgent(id);
    proc.emit('close', 0);
    expect(stmts.getAgent(id)?.status).toBe('completed');
  });

  it('spawn error path marks error when not stopped', () => {
    const proc = fakeProc();
    vi.mocked(spawn).mockReturnValue(proc as never);

    const id = createAgent({ name: 't3', provider: 'codex', prompt: 'hi' });
    startAgent(id);
    proc.emit('error', new Error('ENOENT'));
    expect(stmts.getAgent(id)?.status).toBe('error');
  });
});
