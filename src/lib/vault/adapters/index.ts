import { createHash } from 'node:crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProviderConfig, ToolId, VaultData } from '../store';
import { claudeCodeAdapter } from './claude-code';
import { codexAdapter } from './codex';
import { opencodeAdapter } from './opencode';

export type AdapterFileState = 'ok' | 'missing' | 'conflict' | 'unwritable';

export interface AdapterState {
  fileState: AdapterFileState;
  activeProviderId: string | null;
  conflictDetail?: string;
}

export interface WriteResult {
  state: AdapterState;
  fingerprint: string | null;
}

export interface ToolAdapter {
  id: ToolId;
  label: string;
  configPath(): string;
  detect(data: VaultData): AdapterState;
  activate(p: ProviderConfig, data: VaultData): WriteResult;
  deactivate(data: VaultData): AdapterState;
}

export function fingerprintOf(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function backupConfig(toolId: ToolId, file: string): void {
  if (!fs.existsSync(file)) return;
  const root = process.env.AIHOME_VAULT_BACKUP_DIR ?? path.join(os.homedir(), '.aihome', 'backups');
  const dir = path.join(root, toolId);
  fs.mkdirSync(dir, { recursive: true });
  fs.chmodSync(dir, 0o700);
  const target = path.join(dir, `${Date.now()}.bak`);
  fs.copyFileSync(file, target);
  fs.chmodSync(target, 0o600);
  const entries = fs.readdirSync(dir)
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const e of entries.slice(10)) fs.rmSync(path.join(dir, e.f), { force: true });
}

export const TOOL_ADAPTERS: Record<ToolId, ToolAdapter> = {
  'claude-code': claudeCodeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
};
