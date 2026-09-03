import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearToolsCache, detectTools, findCatalogEntry, openTool } from '../tools';

// execFile 经 promisify 调用：mock 需带 util.promisify.custom（解析 { stdout }）。
// execImpl(cmd, args) 返回 stdout 字符串，抛错等价于命令失败（非零退出/不存在）。
const mocks = vi.hoisted(() => ({
  execImpl: vi.fn<(cmd: string, args: string[]) => string>(),
  spawn: vi.fn(() => ({ unref: () => {} })),
}));

vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(
    vi.fn(
      (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: Error | null, stdout: string) => void,
      ) => {
        try {
          cb(null, mocks.execImpl(cmd, args));
        } catch (err) {
          cb(err as Error, '');
        }
      },
    ),
    {
      [promisify.custom]: (cmd: string, args: string[]) =>
        Promise.resolve({ stdout: mocks.execImpl(cmd, args), stderr: '' }),
    },
  );
  return { execFile, spawn: mocks.spawn };
});

describe('tools 检测库', () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  const ENV_KEYS = [
    'AIHOME_TOOLS_CLAUDE_DIR',
    'AIHOME_TOOLS_CODEX_DIR',
    'AIHOME_TOOLS_OPENCODE_DIR',
    'AIHOME_TOOLS_CLAUDE_DESKTOP_APP',
    'AIHOME_TOOLS_CHATGPT_APP',
    'AIHOME_TOOLS_CLAUDE_DESKTOP_CONFIG',
    'AIHOME_VAULT_CLAUDE_CODE_CONFIG',
    'AIHOME_VAULT_CODEX_CONFIG',
    'AIHOME_VAULT_OPENCODE_CONFIG',
  ] as const;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'aihome-tools-'));
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.AIHOME_TOOLS_CLAUDE_DIR = path.join(tmpDir, 'claude-dir');
    process.env.AIHOME_TOOLS_CODEX_DIR = path.join(tmpDir, 'codex-dir');
    process.env.AIHOME_TOOLS_OPENCODE_DIR = path.join(tmpDir, 'opencode-dir');
    process.env.AIHOME_TOOLS_CLAUDE_DESKTOP_APP = path.join(tmpDir, 'Claude.app');
    process.env.AIHOME_TOOLS_CHATGPT_APP = path.join(tmpDir, 'ChatGPT.app');
    process.env.AIHOME_TOOLS_CLAUDE_DESKTOP_CONFIG = path.join(tmpDir, 'claude-desktop-config.json');
    process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG = path.join(tmpDir, 'claude', 'settings.json');
    process.env.AIHOME_VAULT_CODEX_CONFIG = path.join(tmpDir, 'codex', 'config.toml');
    process.env.AIHOME_VAULT_OPENCODE_CONFIG = path.join(tmpDir, 'opencode', 'opencode.json');
    clearToolsCache();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('CLI 检测', () => {
    it('仅目录存在也判为已安装（无二进制则无版本）', async () => {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(path.join(tmpDir, 'claude-dir'), { recursive: true });
      mocks.execImpl.mockImplementation(() => {
        throw new Error('which: no claude');
      });

      const tools = await detectTools({ refresh: true });
      const claude = tools.find((t) => t.id === 'claude-code');

      expect(claude?.installed).toBe(true);
      expect(claude?.launchPath).toBeNull();
      expect(claude?.version).toBeNull();
      expect(claude?.configPath).toBe(path.join(tmpDir, 'claude', 'settings.json'));
      expect(claude?.kind).toBe('cli');
    });

    it('which 命中即已安装并带版本', async () => {
      mocks.execImpl.mockImplementation((cmd, args) => {
        if (cmd === 'which' && args[0] === 'codex') return '/opt/homebrew/bin/codex\n';
        if (args[0] === '--version') return 'codex-cli 0.9.9\n';
        throw new Error('not found');
      });

      const tools = await detectTools({ refresh: true });
      const codex = tools.find((t) => t.id === 'codex');

      expect(codex?.installed).toBe(true);
      expect(codex?.launchPath).toBe('/opt/homebrew/bin/codex');
      expect(codex?.version).toBe('codex-cli 0.9.9');
    });

    it('目录与二进制都不存在 → 未安装', async () => {
      mocks.execImpl.mockImplementation(() => {
        throw new Error('not found');
      });

      const tools = await detectTools({ refresh: true });
      const opencode = tools.find((t) => t.id === 'opencode');

      expect(opencode?.installed).toBe(false);
      expect(opencode?.launchPath).toBeNull();
      expect(opencode?.version).toBeNull();
    });
  });

  describe('应用检测', () => {
    it('.app 存在 → 已安装，版本来自 plutil', async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync(path.join(tmpDir, 'Claude.app', 'Contents'), { recursive: true });
      writeFileSync(path.join(tmpDir, 'Claude.app', 'Contents', 'Info.plist'), 'plist');
      mocks.execImpl.mockImplementation((cmd, args) => {
        if (cmd === 'plutil' && args.includes('CFBundleShortVersionString')) return '3.2.1\n';
        throw new Error('not found');
      });

      const tools = await detectTools({ refresh: true });
      const claudeDesktop = tools.find((t) => t.id === 'claude-desktop');

      expect(claudeDesktop?.installed).toBe(true);
      expect(claudeDesktop?.kind).toBe('app');
      expect(claudeDesktop?.launchPath).toBe(path.join(tmpDir, 'Claude.app'));
      expect(claudeDesktop?.version).toBe('3.2.1');
      expect(claudeDesktop?.configPath).toBe(path.join(tmpDir, 'claude-desktop-config.json'));
    });

    it('.app 不存在 → 未安装且不做版本探测', async () => {
      mocks.execImpl.mockImplementation(() => '');

      const tools = await detectTools({ refresh: true });
      const chatgpt = tools.find((t) => t.id === 'chatgpt-desktop');

      expect(chatgpt?.installed).toBe(false);
      expect(chatgpt?.version).toBeNull();
      expect(chatgpt?.configPath).toBeNull();
      // 未安装的应用不应触发 plutil
      const plutilCalls = mocks.execImpl.mock.calls.filter(([cmd]) => cmd === 'plutil');
      expect(plutilCalls).toHaveLength(0);
    });
  });

  describe('vault 合并', () => {
    it('vault 未解锁时 CLI 工具 provider 为锁定态，非接入工具为 null', async () => {
      mocks.execImpl.mockImplementation(() => {
        throw new Error('not found');
      });

      const tools = await detectTools({ refresh: true });
      const claude = tools.find((t) => t.id === 'claude-code');
      const claudeDesktop = tools.find((t) => t.id === 'claude-desktop');

      expect(claude?.vaultLinked).toBe(true);
      expect(claude?.provider?.fileState).toBe('locked');
      expect(claude?.provider?.activeProviderName).toBeNull();
      expect(claudeDesktop?.vaultLinked).toBe(false);
      expect(claudeDesktop?.provider).toBeNull();
    });
  });

  describe('缓存', () => {
    it('TTL 内复用缓存，refresh=true 强制重检', async () => {
      mocks.execImpl.mockImplementation(() => {
        throw new Error('not found');
      });

      await detectTools({ refresh: true });
      const callsAfterFirst = mocks.execImpl.mock.calls.length;

      await detectTools();
      expect(mocks.execImpl.mock.calls.length).toBe(callsAfterFirst);

      await detectTools({ refresh: true });
      expect(mocks.execImpl.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });
  });

  describe('openTool', () => {
    it('应用走 open -a <名称>', () => {
      const entry = findCatalogEntry('claude-desktop');
      expect(entry).toBeDefined();
      const result = openTool(entry!);

      expect(result).toEqual({ ok: true });
      expect(mocks.spawn).toHaveBeenCalledWith('open', ['-a', 'Claude'], expect.anything());
    });

    it('CLI 用 Finder 打开配置目录', () => {
      const entry = findCatalogEntry('codex');
      const result = openTool(entry!);

      expect(result).toEqual({ ok: true });
      expect(mocks.spawn).toHaveBeenCalledWith(
        'open',
        [path.dirname(path.join(tmpDir, 'codex', 'config.toml'))],
        expect.anything(),
      );
    });

    it('非 macOS 平台拒绝执行', () => {
      const entry = findCatalogEntry('claude-code')!;
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        const result = openTool(entry);
        expect(result).toEqual({ ok: false, reason: 'unsupported-platform' });
        expect(mocks.spawn).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: original });
      }
    });

    it('未知工具查不到目录条目', () => {
      expect(findCatalogEntry('not-a-tool')).toBeUndefined();
    });
  });
});
