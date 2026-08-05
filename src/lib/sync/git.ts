import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, mkdir } from 'fs/promises';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export type GitErrorCode = 'GIT_MISSING' | 'GIT_CONFLICT' | 'GIT_PERMISSION' | 'GIT_OTHER';

export function classifyGitError(err: unknown): GitErrorCode {
  const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
  if (e?.code === 'ENOENT') return 'GIT_MISSING';
  const text = `${e?.stderr ?? ''} ${e?.stdout ?? ''} ${e?.message ?? ''}`;
  if (/permission denied|eacces/i.test(text)) return 'GIT_PERMISSION';
  if (/unmerged|merge conflict|conflict/i.test(text)) return 'GIT_CONFLICT';
  return 'GIT_OTHER';
}

export async function gitCommit(
  repoDir: string,
  message: string
): Promise<{ ok: boolean; code?: GitErrorCode }> {
  try {
    try {
      await access(path.join(repoDir, '.git'));
    } catch {
      await mkdir(repoDir, { recursive: true });
      await execFileAsync('git', ['init'], { cwd: repoDir });
    }
    await execFileAsync('git', ['add', '-A'], { cwd: repoDir });
    try {
      await execFileAsync('git', ['diff', '--cached', '--quiet'], { cwd: repoDir });
      return { ok: true }; // 无变更
    } catch {
      await execFileAsync('git', ['commit', '-m', message], { cwd: repoDir });
      return { ok: true };
    }
  } catch (err) {
    return { ok: false, code: classifyGitError(err) };
  }
}
