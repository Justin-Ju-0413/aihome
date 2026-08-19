import * as os from 'os';
import * as path from 'path';
import { configDir } from '@/lib/sync/paths';
import type { ActiveUsageSource } from './types';

export const USAGE_SOURCE_PATHS: Record<ActiveUsageSource, () => string> = {
  'cc-switch': () =>
    process.env.AIHOME_USAGE_CCSWITCH_DB ?? path.join(os.homedir(), '.cc-switch', 'cc-switch.db'),
  claude: () =>
    process.env.AIHOME_USAGE_CLAUDE_DIR ?? path.join(os.homedir(), '.claude', 'projects'),
  codex: () =>
    process.env.AIHOME_USAGE_CODEX_DIR ?? path.join(os.homedir(), '.codex', 'sessions'),
  opencode: () =>
    process.env.AIHOME_USAGE_OPENCODE_DB ??
    path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db'),
  hermes: () =>
    process.env.AIHOME_USAGE_HERMES_DB ?? path.join(os.homedir(), '.hermes', 'state.db'),
  openclaw: () =>
    process.env.AIHOME_USAGE_OPENCLAW_DIR ?? path.join(os.homedir(), '.openclaw', 'agents'),
  zcode: () =>
    process.env.AIHOME_USAGE_ZCODE_DIR ?? path.join(os.homedir(), '.zcode', 'cli', 'rollout'),
  dsh: () =>
    process.env.AIHOME_USAGE_DSH_STORE ?? path.join(os.homedir(), '.dsh', 'storages', 'session_projcache.json'),
};

export function usageCachePath(): string {
  return process.env.AIHOME_USAGE_CACHE ?? path.join(configDir(), 'usage-cache.db');
}
