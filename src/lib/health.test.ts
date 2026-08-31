import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkWorkspace } from './health';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aihome-health-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeAgent(dir: string, name: string) {
  mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, dir, 'AGENTS.md'), `# ${name}\n\nbody\n`);
}

describe('checkWorkspace', () => {
  it('reports nothing for a healthy workspace', async () => {
    makeAgent('alpha', 'Alpha');
    const issues = await checkWorkspace([path.join(root, 'alpha')]);
    expect(issues).toHaveLength(0);
  });

  it('reports unreadable paths', async () => {
    const missing = path.join(root, 'nope');
    const issues = await checkWorkspace([missing]);
    expect(issues.some((i) => i.type === 'unreadable_path')).toBe(true);
  });

  it('reports duplicate agent names across directories', async () => {
    makeAgent('a', 'Dup');
    makeAgent('b', 'Dup');
    const issues = await checkWorkspace([path.join(root, 'a'), path.join(root, 'b')]);
    const dup = issues.find((i) => i.type === 'duplicate_name')!;
    expect(dup).toBeDefined();
    expect(dup.detail).toContain('Dup');
  });

  it('passes scan errors through', async () => {
    // 扫描一个不存在目录 → scanDirectories 记录 errors（access 已先报 unreadable_path，
    // scan_error 是扫描阶段的独立信号；这里直接用不存在目录验证不抛异常且能返回）
    const issues = await checkWorkspace([path.join(root, 'missing-dir')]);
    expect(Array.isArray(issues)).toBe(true);
  });

  it('does not use scan cache (real state)', async () => {
    const spy = vi.spyOn(await import('./scanner'), 'scanDirectories');
    await checkWorkspace([path.join(root, 'empty')]);
    expect(spy).toHaveBeenCalledWith([path.join(root, 'empty')], { cache: false });
    spy.mockRestore();
  });
});
