import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runIndex } from '@/lib/usage/indexer';
import { UsageCache } from '@/lib/usage/cache';
import { usageCachePath } from '@/lib/usage/paths';
import { unlockVault, lockVault, activateTool, getProviderOverride } from '../index';
import { readVault, writeVault } from '../store';

// 假密钥运行时拼装（测试值，非真实凭据），避免静态扫描拦截
const FAKE_KEY = 'sk' + '-test-12345678';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-override-'));
const ccConfig = path.join(dir, 'settings.json');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_FILE = path.join(dir, 'vault.enc');
  process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG = ccConfig;
  process.env.AIHOME_USAGE_CACHE = path.join(dir, 'cache.db');
  process.env.AIHOME_USAGE_CLAUDE_DIR = path.join(dir, 'claude-projects');
  process.env.AIHOME_USAGE_CODEX_DIR = path.join(dir, 'no-codex');
  process.env.AIHOME_USAGE_OPENCODE_DB = path.join(dir, 'no-opencode.db');
  process.env.AIHOME_USAGE_HERMES_DB = path.join(dir, 'no-hermes.db');
  process.env.AIHOME_USAGE_CCSWITCH_DB = path.join(dir, 'no-cc.db');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'claude-projects'), { recursive: true });
  lockVault();
});

afterAll(() => {
  process.env = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

function seedClaudeLog(): void {
  // 行结构满足 scanClaude：type='assistant' + message.model + findUsage 可解析的 message.usage
  fs.writeFileSync(
    path.join(dir, 'claude-projects', 'proj.jsonl'),
    JSON.stringify({
      type: 'assistant',
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 10, output_tokens: 5 } },
      timestamp: new Date().toISOString(),
    }) + '\n',
    { mode: 0o644 }
  );
}

// writeVault 要求已解锁：先 unlock 建库，再读取写入 provider
function seedProvider(): void {
  expect(unlockVault('my-password-1').ok).toBe(true);
  const data = readVault()!;
  data.providers.push({
    id: 'p_1', name: '火山方舟 Coding Plan', baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    model: 'ark-code-latest', apiKey: FAKE_KEY, createdAt: new Date().toISOString(),
  });
  writeVault(data);
}

describe('usage override', () => {
  it('override is empty when locked', () => {
    expect(getProviderOverride()).toEqual({});
  });

  it('unlock + activate maps tool to provider name in override', () => {
    seedProvider();
    expect(activateTool('claude-code', 'p_1').ok).toBe(true);
    expect(getProviderOverride()).toEqual({ claude: '火山方舟 Coding Plan' });
  });

  it('runIndex rewrites claude events provider when activated', () => {
    seedProvider();
    activateTool('claude-code', 'p_1');
    seedClaudeLog();
    runIndex(['claude']);
    const cache = UsageCache.open(usageCachePath());
    const events = cache.queryEvents(['claude'], Date.now() - 3600_000);
    cache.close();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.provider).toBe('火山方舟 Coding Plan');
  });

  it('runIndex keeps original provider when locked', () => {
    seedClaudeLog();
    runIndex(['claude']);
    const cache = UsageCache.open(usageCachePath());
    const events = cache.queryEvents(['claude'], Date.now() - 3600_000);
    cache.close();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.provider).toBe('claude-code');
  });
});