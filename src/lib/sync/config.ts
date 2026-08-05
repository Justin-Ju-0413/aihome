import { readFile, writeFile, mkdir, access, rename } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { configDir } from './paths';

export const DEFAULT_ENDPOINTS: Record<string, string> = {
  opencode: path.join(os.homedir(), '.config', 'opencode', 'skills'),
  claude: path.join(os.homedir(), '.claude', 'skills'),
  codex: path.join(os.homedir(), '.codex', 'skills'),
  hermes: path.join(os.homedir(), '.hermes', 'skills'),
};

export interface SyncConfig {
  version: 1;
  endpoints: Record<string, string>;
}

export function syncConfigPath(): string {
  return path.join(configDir(), 'sync-config.json');
}

async function ensureConfigDir(): Promise<void> {
  try {
    await access(configDir());
  } catch {
    await mkdir(configDir(), { recursive: true });
  }
}

export async function loadSyncConfig(): Promise<SyncConfig> {
  await ensureConfigDir();
  try {
    const data = JSON.parse(await readFile(syncConfigPath(), 'utf-8')) as Partial<SyncConfig>;
    if (data && typeof data === 'object' && data.endpoints && typeof data.endpoints === 'object') {
      return { version: 1, endpoints: data.endpoints as Record<string, string> };
    }
    return { version: 1, endpoints: {} };
  } catch {
    return { version: 1, endpoints: {} };
  }
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  await ensureConfigDir();
  const tmp = `${syncConfigPath()}.tmp`;
  await writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  await rename(tmp, syncConfigPath());
}

export async function getEndpoints(): Promise<Record<string, string>> {
  const config = await loadSyncConfig();
  const endpoints = config.endpoints;
  return Object.keys(endpoints).length > 0 ? endpoints : DEFAULT_ENDPOINTS;
}

export function validateEndpointName(name: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(name);
}

export async function setEndpoints(endpoints: Record<string, string>): Promise<void> {
  const cleaned: Record<string, string> = {};
  for (const [name, p] of Object.entries(endpoints)) {
    if (validateEndpointName(name) && typeof p === 'string' && p.trim()) {
      const trimmed = p.trim();
      const expanded = trimmed.startsWith('~/') ? path.join(os.homedir(), trimmed.slice(2)) : trimmed;
      cleaned[name] = path.resolve(expanded);
    }
  }
  await saveSyncConfig({ version: 1, endpoints: cleaned });
}
