import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProviderConfig, VaultData } from '../store';
import { backupConfig, fingerprintOf, type AdapterState, type ToolAdapter, type WriteResult } from './index';

export const CLAUDE_CODE_FIELDS = [
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL', 'AIHOME_VAULT_PROVIDER',
] as const;

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const claudeCodeAdapter: ToolAdapter = {
  id: 'claude-code',
  label: 'Claude Code',
  configPath(): string {
    return process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG ??
      path.join(os.homedir(), '.claude', 'settings.json');
  },

  detect(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    const cfg = readJson(file);
    if (!cfg) return { fileState: 'conflict', activeProviderId: null, conflictDetail: 'settings.json 不是合法 JSON' };
    const env = (cfg.env ?? {}) as Record<string, string>;
    const anyInjected = CLAUDE_CODE_FIELDS.some((k) => typeof env[k] === 'string');
    if (!anyInjected) return { fileState: 'ok', activeProviderId: null };
    const fp = fingerprintOf(JSON.stringify([
      env.ANTHROPIC_BASE_URL, env.ANTHROPIC_AUTH_TOKEN, env.ANTHROPIC_MODEL, env.AIHOME_VAULT_PROVIDER,
    ]));
    const written = data.lastWritten['claude-code'];
    if (!written || written.fingerprint !== fp) {
      return { fileState: 'conflict', activeProviderId: null, conflictDetail: '注入字段被手动修改' };
    }
    return { fileState: 'ok', activeProviderId: env.AIHOME_VAULT_PROVIDER };
  },

  activate(p: ProviderConfig, data: VaultData): WriteResult {
    const file = this.configPath();
    const state = this.detect(data);
    if (state.fileState === 'conflict') return { state, fingerprint: null };
    backupConfig('claude-code', file);
    const cfg = readJson(file) ?? {};
    const env = (cfg.env ?? {}) as Record<string, string>;
    env.ANTHROPIC_BASE_URL = p.baseUrl;
    env.ANTHROPIC_AUTH_TOKEN = p.apiKey;
    env.ANTHROPIC_MODEL = p.model;
    env.AIHOME_VAULT_PROVIDER = p.id;
    cfg.env = env;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    return { state: { fileState: 'ok', activeProviderId: p.id }, fingerprint: fingerprintFor(p) };
  },

  deactivate(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    const cfg = readJson(file);
    if (!cfg) return { fileState: 'conflict', activeProviderId: null, conflictDetail: 'settings.json 不是合法 JSON' };
    const env = (cfg.env ?? {}) as Record<string, string>;
    for (const k of CLAUDE_CODE_FIELDS) delete env[k];
    if (Object.keys(env).length === 0) delete cfg.env;
    else cfg.env = env;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    return { fileState: 'ok', activeProviderId: null };
  },
};

function fingerprintFor(p: ProviderConfig): string {
  return fingerprintOf(JSON.stringify([p.baseUrl, p.apiKey, p.model, p.id]));
}
