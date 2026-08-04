import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { gitCommit } from '../git';

const execFileAsync = promisify(execFile);
const tmp = path.join(os.tmpdir(), `aihome-git-test-${process.pid}`);

beforeEach(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe('gitCommit', () => {
  it('inits repo and commits changes', async () => {
    const repo = path.join(tmp, 'repo');
    await fs.mkdir(path.join(repo, 'common'), { recursive: true });
    await fs.writeFile(path.join(repo, 'common', 'x.txt'), 'v1', 'utf-8');
    const result = await gitCommit(repo, 'sync: test');
    expect(result.ok).toBe(true);
    const log = await execFileAsync('git', ['log', '--oneline'], { cwd: repo });
    expect(log.stdout).toContain('sync: test');
  });

  it('returns ok when nothing changed', async () => {
    const repo = path.join(tmp, 'repo2');
    await fs.mkdir(path.join(repo, 'common'), { recursive: true });
    await fs.writeFile(path.join(repo, 'common', 'x.txt'), 'v1', 'utf-8');
    await gitCommit(repo, 'sync: first');
    const result = await gitCommit(repo, 'sync: second');
    expect(result.ok).toBe(true);
    const log = await execFileAsync('git', ['log', '--oneline'], { cwd: repo });
    expect(log.stdout.split('\n').length).toBe(2); // 只有 first 一次提交
  });
});
