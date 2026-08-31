import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProviderConfig, VaultData } from '../store';
import { backupConfig, fingerprintOf, type AdapterState, type ToolAdapter, type WriteResult } from './index';

export function codexAuthPath(): string {
  return process.env.AIHOME_VAULT_CODEX_AUTH ?? path.join(os.homedir(), '.codex', 'auth.json');
}

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const segName = (id: string) => `vault_${id}`;
const envKeyName = (id: string) => `AIHOME_VAULT_${id}`;
const sectionStart = (id: string) => `[model_providers.vault_${id}]`;

function readAuth(): Record<string, string> {
  const f = codexAuthPath();
  if (!fs.existsSync(f)) return {};
  return JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, string>;
}

function writeAuth(auth: Record<string, string>): void {
  const f = codexAuthPath();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(auth, null, 2));
  fs.chmodSync(f, 0o600);
}

function replaceSection(lines: string[], start: string, body: string[]): string[] {
  const out = [...lines];
  const idx = out.findIndex((l) => l.startsWith(start));
  if (idx === -1) {
    const trimmed = out.map((l) => l.trimEnd());
    while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop();
    trimmed.push('', start, ...body);
    return trimmed;
  }
  let end = idx + 1;
  while (end < out.length && !out[end].startsWith('[')) end++;
  return [...out.slice(0, idx), start, ...body, ...out.slice(end)];
}

/**
 * model 行处理：vault_ 前缀的现值 → 替换；用户自定义 model 行 → 原行不动，
 * 注入行挂到 vault 段内（避免顶层重复 model 键产生非法 TOML）；无 model 行 → 顶层追加。
 */
function applyModelLine(lines: string[], start: string, injectedModel: string): string[] {
  const out = [...lines];
  const value = `model = "${esc(injectedModel)}"`;
  const idx = out.findIndex((l) => /^model\s*=/.test(l));
  if (idx !== -1) {
    const current = out[idx].split('=')[1]?.trim() ?? '';
    if (current.startsWith('"vault_')) {
      out[idx] = value;
      return out;
    }
    const sIdx = out.findIndex((l) => l.startsWith(start));
    if (sIdx !== -1) {
      let end = sIdx + 1;
      while (end < out.length && !out[end].startsWith('[')) end++;
      return [...out.slice(0, end), value, ...out.slice(end)];
    }
    return out;
  }
  out.push(value);
  return out;
}

function removeSection(lines: string[], start: string): string[] {
  const out = [...lines];
  const idx = out.findIndex((l) => l.startsWith(start));
  if (idx === -1) return out;
  let end = idx + 1;
  while (end < out.length && !out[end].startsWith('[')) end++;
  return [...out.slice(0, idx), ...out.slice(end)];
}

/** 每工具同时只有一个激活 provider：写入新段前清掉所有旧注入段 */
function removeAllInjectedSections(lines: string[]): string[] {
  let out = [...lines];
  for (const l of [...out]) {
    if (!/^\[model_providers\.vault_/.test(l.trim())) continue;
    out = removeSection(out, l.trim());
  }
  return out;
}

function removeInjectedModelLine(lines: string[]): string[] {
  return lines.filter((l) => !(/^model\s*=/.test(l) && /vault_/.test(l)));
}

export const codexAdapter: ToolAdapter = {
  id: 'codex',
  label: 'Codex',
  configPath(): string {
    return process.env.AIHOME_VAULT_CODEX_CONFIG ?? path.join(os.homedir(), '.codex', 'config.toml');
  },

  detect(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const idx = lines.findIndex((l) => /^\[model_providers\.vault_/.test(l.trim()));
    if (idx === -1) return { fileState: 'ok', activeProviderId: null };
    const match = lines[idx].match(/^\[model_providers\.vault_(.+)\]/);
    if (!match) return { fileState: 'conflict', activeProviderId: null, conflictDetail: '无法解析注入段' };
    const providerId = match[1];
    try {
      const auth = readAuth();
      const keyVal = auth[envKeyName(providerId)] ?? '';
      const baseUrl = lines.slice(idx + 1)
        .find((l) => /^base_url\s*=/.test(l))?.split('=')[1]?.trim().replace(/"/g, '') ?? '';
      const fp = fingerprintOf(JSON.stringify([baseUrl, keyVal, providerId]));
      const written = data.lastWritten['codex'];
      if (!written || written.fingerprint !== fp) {
        return { fileState: 'conflict', activeProviderId: null, conflictDetail: '注入字段被手动修改' };
      }
      return { fileState: 'ok', activeProviderId: providerId };
    } catch {
      return { fileState: 'conflict', activeProviderId: null, conflictDetail: 'auth.json 不是合法 JSON' };
    }
  },

  activate(p: ProviderConfig, data: VaultData): WriteResult {
    const file = this.configPath();
    const state = this.detect(data);
    if (state.fileState === 'conflict') return { state, fingerprint: null };
    backupConfig('codex', file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
    const start = sectionStart(p.id);
    let out = replaceSection(removeAllInjectedSections(lines), start, [
      `name = "${esc(p.name)}"`,
      `base_url = "${esc(p.baseUrl)}"`,
      `env_key = "${envKeyName(p.id)}"`,
    ]);
    out = applyModelLine(out, start, `${segName(p.id)}/${p.model}`);
    fs.writeFileSync(file, out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
    const auth = readAuth();
    auth[envKeyName(p.id)] = p.apiKey;
    writeAuth(auth);
    const fingerprint = fingerprintOf(JSON.stringify([p.baseUrl, p.apiKey, p.id]));
    return { state: { fileState: 'ok', activeProviderId: p.id }, fingerprint };
  },

  deactivate(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    let out = fs.readFileSync(file, 'utf8').split('\n');
    for (const l of [...out]) {
      const m = l.match(/^\[model_providers\.vault_(.+)\]/);
      if (!m) continue;
      out = removeSection(out, l.trim());
      try {
        const auth = readAuth();
        if (auth[envKeyName(m[1])] !== undefined) {
          delete auth[envKeyName(m[1])];
          writeAuth(auth);
        }
      } catch { /* auth 损坏则不清理 */ }
    }
    out = removeInjectedModelLine(out);
    fs.writeFileSync(file, out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
    return { fileState: 'ok', activeProviderId: null };
  },
};
