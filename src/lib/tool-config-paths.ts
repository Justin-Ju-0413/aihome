import * as path from 'path';
import * as os from 'os';

/**
 * vault 接管的三个 CLI 工具配置文件路径(单一事实来源)。
 * tools.ts 的检测目录表与 vault adapters 的读写都从这里取,
 * env(AIHOME_VAULT_*)覆盖语义与 fallback 保持一致。
 */
export const vaultToolConfigPaths: Record<'claude-code' | 'codex' | 'opencode', () => string> = {
  'claude-code': () =>
    process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG ??
    path.join(os.homedir(), '.claude', 'settings.json'),
  codex: () =>
    process.env.AIHOME_VAULT_CODEX_CONFIG ??
    path.join(os.homedir(), '.codex', 'config.toml'),
  opencode: () =>
    process.env.AIHOME_VAULT_OPENCODE_CONFIG ??
    path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
};
