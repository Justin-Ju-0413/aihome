import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProviderConfig, VaultData } from '../store';
import { backupConfig, fingerprintOf, type AdapterState, type ToolAdapter, type WriteResult } from './index';

const segId = (id: string) => `vault_${id}`;

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const opencodeAdapter: ToolAdapter = {
  id: 'opencode',
  label: 'opencode',
  configPath(): string {
    return process.env.AIHOME_VAULT_OPENCODE_CONFIG ??
      path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  },

  detect(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    const cfg = readJson(file);
    if (!cfg) return { fileState: 'conflict', activeProviderId: null, conflictDetail: 'opencode.json 不是合法 JSON' };
    const providers = (cfg.provider ?? {}) as Record<string, unknown>;
    const entry = Object.keys(providers).find((k) => k.startsWith('vault_'));
    if (!entry) return { fileState: 'ok', activeProviderId: null };
    const providerId = entry.slice('vault_'.length);
    const seg = providers[entry] as { baseURL?: string; headers?: Record<string, string> };
    const key = seg.headers?.Authorization?.replace(/^Bearer /, '') ?? '';
    const fp = fingerprintOf(JSON.stringify([seg.baseURL ?? '', key, providerId]));
    const written = data.lastWritten['opencode'];
    if (!written || written.fingerprint !== fp) {
      return { fileState: 'conflict', activeProviderId: null, conflictDetail: '注入字段被手动修改' };
    }
    return { fileState: 'ok', activeProviderId: providerId };
  },

  activate(p: ProviderConfig, data: VaultData): WriteResult {
    const file = this.configPath();
    const state = this.detect(data);
    if (state.fileState === 'conflict') return { state, fingerprint: null };
    backupConfig('opencode', file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const cfg = readJson(file) ?? {};
    const providers = (cfg.provider ?? {}) as Record<string, unknown>;
    // 每工具同时只有一个激活 provider：先清旧注入段再写新段，防止切换后 detect 误判冲突
    for (const k of Object.keys(providers)) {
      if (k.startsWith('vault_')) delete providers[k];
    }
    const id = segId(p.id);
    providers[id] = {
      npm: '@ai-sdk/openai-compatible',
      baseURL: p.baseUrl,
      headers: { Authorization: `Bearer ${p.apiKey}` },
      models: { [p.model]: { name: p.model } },
    };
    cfg.provider = providers;
    if (typeof cfg.model !== 'string' || cfg.model.startsWith('vault_')) {
      cfg.model = `${id}/${p.model}`;
    }
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    const fingerprint = fingerprintOf(JSON.stringify([p.baseUrl, p.apiKey, p.id]));
    return { state: { fileState: 'ok', activeProviderId: p.id }, fingerprint };
  },

  deactivate(data: VaultData): AdapterState {
    const file = this.configPath();
    const cfg = readJson(file);
    if (!cfg) return { fileState: 'missing', activeProviderId: null };
    const providers = (cfg.provider ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(providers)) {
      if (k.startsWith('vault_')) delete providers[k];
    }
    if (Object.keys(providers).length === 0) delete cfg.provider;
    else cfg.provider = providers;
    if (typeof cfg.model === 'string' && cfg.model.startsWith('vault_')) delete cfg.model;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    return { fileState: 'ok', activeProviderId: null };
  },
};
