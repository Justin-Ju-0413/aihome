import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getStatus } from '@/lib/vault';

const execFileAsync = promisify(execFile);

/**
 * 本机 AI 工具检测（只读）。
 *
 * 与 usage/vault 同一惯例：所有路径常量 + env 可覆盖，绝不接受客户端传入路径；
 * 探测只读（existsSync / which / --version / plutil）。
 *
 * 「打开」动作：唯一执行的外部命令是字面量 `open`（macOS），
 * 参数来自 TOOL_CATALOG 白名单条目（id 先经 findCatalogEntry 校验），
 * 参数数组形式、无 shell。
 */

export type ToolKind = 'cli' | 'app';

/** 展示目录条目 id。注意与 vault 的 ToolId 是不同集合（vault 仅三个 CLI）。 */
export type ToolEntryId =
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'claude-desktop'
  | 'chatgpt-desktop';

export interface ToolProviderInfo {
  activeProviderName: string | null;
  fileState: 'ok' | 'missing' | 'conflict' | 'unwritable' | 'locked';
  conflictDetail?: string;
  stale: boolean;
}

export interface InstalledTool {
  id: ToolEntryId;
  name: string;
  kind: ToolKind;
  installed: boolean;
  version: string | null;
  /** CLI：二进制绝对路径；应用：.app 路径；未检出为 null */
  launchPath: string | null;
  configPath: string | null;
  vaultLinked: boolean;
  /** 仅 vaultLinked 工具有；来自 vault getStatus()，锁定时 fileState='locked' */
  provider: ToolProviderInfo | null;
}

interface ToolCatalogEntry {
  id: ToolEntryId;
  name: string;
  kind: ToolKind;
  /** 安装判定路径：CLI 为配置目录，应用为 .app 路径（env 可覆盖） */
  installPath: () => string;
  /** CLI 二进制名 / 应用 `open -a` 名称 */
  binary: string;
  configPath: () => string | null;
  /** 是否接入 vault provider 体系 */
  vaultLinked: boolean;
}

const envPath = (key: string, fallback: () => string) => () =>
  process.env[key] ?? fallback();

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'cli',
    installPath: envPath('AIHOME_TOOLS_CLAUDE_DIR', () => path.join(os.homedir(), '.claude')),
    binary: 'claude',
    configPath: envPath(
      'AIHOME_VAULT_CLAUDE_CODE_CONFIG',
      () => path.join(os.homedir(), '.claude', 'settings.json'),
    ),
    vaultLinked: true,
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    kind: 'cli',
    installPath: envPath('AIHOME_TOOLS_CODEX_DIR', () => path.join(os.homedir(), '.codex')),
    binary: 'codex',
    configPath: envPath(
      'AIHOME_VAULT_CODEX_CONFIG',
      () => path.join(os.homedir(), '.codex', 'config.toml'),
    ),
    vaultLinked: true,
  },
  {
    id: 'opencode',
    name: 'opencode',
    kind: 'cli',
    installPath: envPath(
      'AIHOME_TOOLS_OPENCODE_DIR',
      () => path.join(os.homedir(), '.config', 'opencode'),
    ),
    binary: 'opencode',
    configPath: envPath(
      'AIHOME_VAULT_OPENCODE_CONFIG',
      () => path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
    ),
    vaultLinked: true,
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    kind: 'app',
    installPath: envPath('AIHOME_TOOLS_CLAUDE_DESKTOP_APP', () => '/Applications/Claude.app'),
    binary: 'Claude',
    configPath: envPath(
      'AIHOME_TOOLS_CLAUDE_DESKTOP_CONFIG',
      () => path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    ),
    vaultLinked: false,
  },
  {
    id: 'chatgpt-desktop',
    name: 'ChatGPT',
    kind: 'app',
    installPath: envPath('AIHOME_TOOLS_CHATGPT_APP', () => '/Applications/ChatGPT.app'),
    binary: 'ChatGPT',
    configPath: () => null,
    vaultLinked: false,
  },
];

const VERSION_TIMEOUT_MS = 3_000;
const DETECT_CACHE_TTL_MS = 60_000;

async function resolveCliBinary(binary: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [binary], { timeout: VERSION_TIMEOUT_MS });
    const p = stdout.trim();
    return p || null;
  } catch {
    return null;
  }
}

async function readCliVersion(binaryPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: VERSION_TIMEOUT_MS });
    const line = stdout.split('\n')[0]?.trim();
    return line || null;
  } catch {
    return null;
  }
}

/** .app 版本：plutil 读 Info.plist（固定二进制 + 目录内固定路径） */
async function readAppVersion(appPath: string): Promise<string | null> {
  try {
    const plist = path.join(appPath, 'Contents', 'Info.plist');
    const { stdout } = await execFileAsync(
      'plutil',
      ['-extract', 'CFBundleShortVersionString', 'raw', plist],
      { timeout: VERSION_TIMEOUT_MS },
    );
    const v = stdout.trim();
    return v || null;
  } catch {
    return null;
  }
}

async function detectOne(entry: ToolCatalogEntry, vaultTools: Map<string, ToolProviderInfo>): Promise<InstalledTool> {
  const configPath = entry.configPath();
  const base: InstalledTool = {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    installed: false,
    version: null,
    launchPath: null,
    configPath,
    vaultLinked: entry.vaultLinked,
    provider: entry.vaultLinked ? vaultTools.get(entry.id) ?? null : null,
  };

  if (entry.kind === 'app') {
    const appPath = entry.installPath();
    const installed = fs.existsSync(appPath);
    return {
      ...base,
      installed,
      launchPath: installed ? appPath : null,
      version: installed ? await readAppVersion(appPath) : null,
    };
  }

  const dirExists = fs.existsSync(entry.installPath());
  const binaryPath = await resolveCliBinary(entry.binary);
  const installed = dirExists || !!binaryPath;
  return {
    ...base,
    installed,
    launchPath: binaryPath,
    version: binaryPath ? await readCliVersion(binaryPath) : null,
  };
}

let cache: { at: number; tools: InstalledTool[] } | null = null;

/** 检测全部工具。带 60s 进程内缓存；refresh=true 强制重检。 */
export async function detectTools(options?: { refresh?: boolean }): Promise<InstalledTool[]> {
  if (!options?.refresh && cache && Date.now() - cache.at < DETECT_CACHE_TTL_MS) {
    return cache.tools;
  }
  const vaultTools = new Map(
    getStatus().tools.map((t) => [t.id, {
      activeProviderName: t.activeProviderName,
      fileState: t.fileState,
      conflictDetail: t.conflictDetail,
      stale: t.stale,
    } satisfies ToolProviderInfo]),
  );
  const tools = await Promise.all(TOOL_CATALOG.map((entry) => detectOne(entry, vaultTools)));
  cache = { at: Date.now(), tools };
  return tools;
}

/** 测试与刷新后清缓存用 */
export function clearToolsCache(): void {
  cache = null;
}

export function findCatalogEntry(toolId: string): ToolCatalogEntry | undefined {
  return TOOL_CATALOG.find((e) => e.id === toolId);
}

/**
 * 打开工具（应用或配置目录）。
 *
 * 安全边界：toolId 必须先经 findCatalogEntry 白名单命中；执行命令固定为字面量
 * `open`（macOS 专属，其他平台直接拒绝），参数只由目录表常量构成，数组形式无 shell。
 */
export function openTool(
  entry: ToolCatalogEntry,
): { ok: true } | { ok: false; reason: 'unsupported-platform' } {
  if (process.platform !== 'darwin') return { ok: false, reason: 'unsupported-platform' };
  const args = entry.kind === 'app'
    ? ['-a', entry.binary]
    : (() => {
        const configPath = entry.configPath();
        return configPath ? [path.dirname(configPath)] : [];
      })();
  if (args.length === 0) return { ok: false, reason: 'unsupported-platform' };
  const child = spawn('open', args, { detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true };
}
