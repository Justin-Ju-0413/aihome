import { access, constants } from 'node:fs/promises';
import { scanDirectories } from './scanner';
import type { ScanResult } from './types';

export type HealthIssue = {
  type: 'unreadable_path' | 'scan_error' | 'duplicate_name';
  detail: string;
};

/** 工作区健康检查：不可读路径 / 扫描与解析错误 / 重名 agent */
export async function checkWorkspace(paths: string[]): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];

  for (const p of paths) {
    try {
      await access(p, constants.R_OK);
    } catch {
      issues.push({ type: 'unreadable_path', detail: p });
    }
  }

  // cache: false —— 健康检查要看真实状态，不能命中缓存掩盖问题
  const result: ScanResult = await scanDirectories(paths, { cache: false });
  for (const e of result.errors) {
    issues.push({ type: 'scan_error', detail: e });
  }

  const byName = new Map<string, string[]>();
  for (const a of result.agents) {
    const list = byName.get(a.name) ?? [];
    list.push(a.id);
    byName.set(a.name, list);
  }
  for (const [name, ids] of byName) {
    if (ids.length > 1) {
      issues.push({ type: 'duplicate_name', detail: `${name}: ${ids.join(', ')}` });
    }
  }

  return issues;
}
