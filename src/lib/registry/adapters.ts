import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Registry } from './registry';

export type PlatformAdapter = {
  name: string;
  displayName: string;
  skillDir: string;
  isInstalled: () => boolean;
};

export const BUILTIN_ADAPTERS: PlatformAdapter[] = [
  {
    name: 'claude-code',
    displayName: 'Claude Code',
    skillDir: path.join(os.homedir(), '.claude', 'skills'),
    isInstalled: () => fs.existsSync(path.join(os.homedir(), '.claude')),
  },
  {
    name: 'codex',
    displayName: 'OpenAI Codex',
    skillDir: path.join(os.homedir(), '.codex', 'skills'),
    isInstalled: () => fs.existsSync(path.join(os.homedir(), '.codex')),
  },
  {
    name: 'workbuddy',
    displayName: 'WorkBuddy',
    skillDir: path.join(os.homedir(), '.workbuddy', 'skills'),
    isInstalled: () => fs.existsSync(path.join(os.homedir(), '.workbuddy')),
  },
];

export function detectInstalled(): PlatformAdapter[] {
  return BUILTIN_ADAPTERS.filter((a) => a.isInstalled());
}

export function ensurePlatformsRegistered(reg: Registry): void {
  for (const adapter of detectInstalled()) {
    reg.registerPlatform(adapter.name, adapter.skillDir);
  }
}

/** 链接归属检测：目标是 symlink 且 realpath 等于规范目录 → 注册表管理 */
export function isManagedLink(targetPath: string, canonicalDir: string): boolean {
  try {
    const stat = fs.lstatSync(targetPath);
    if (!stat.isSymbolicLink()) return false;
    const resolved = fs.realpathSync(targetPath);
    const canonical = fs.realpathSync(canonicalDir);
    return resolved === canonical;
  } catch {
    return false;
  }
}
