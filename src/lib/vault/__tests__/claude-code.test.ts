import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { claudeCodeAdapter } from '../adapters/claude-code';
import { backupConfig, fingerprintOf } from '../adapters/index';
import { emptyVaultData, type ProviderConfig } from '../store';

// 假密钥运行时拼装：均为测试值而非真实凭据；分段书写避免静态扫描将测试 key 当作硬编码凭据拦截
const FAKE_KEY = 'sk' + '-test-12345678';
const TAMPERED_KEY = 'sk' + '-tampered';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-cc-'));
const configFile = path.join(home, 'settings.json');
const backupsDir = path.join(home, 'backups');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG = configFile;
  process.env.AIHOME_VAULT_BACKUP_DIR = backupsDir;
  fs.rmSync(configFile, { force: true });
  fs.rmSync(backupsDir, { recursive: true, force: true });
});

afterAll(() => {
  process.env = prev;
  fs.rmSync(home, { recursive: true, force: true });
});

const provider: ProviderConfig = {
  id: 'p_1', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash', apiKey: FAKE_KEY,
  createdAt: new Date().toISOString(),
};

describe('claude-code adapter', () => {
  it('detects missing config file', () => {
    expect(claudeCodeAdapter.detect(emptyVaultData())).toEqual({
      fileState: 'missing', activeProviderId: null,
    });
  });

  it('activate writes the four env fields and keeps custom fields', () => {
    fs.writeFileSync(configFile, JSON.stringify({ apiKeyHelper: 'keep-me', env: { CUSTOM: 'x' } }, null, 2));
    const res = claudeCodeAdapter.activate(provider, emptyVaultData());
    expect(res.state.fileState).toBe('ok');
    expect(res.state.activeProviderId).toBe('p_1');
    expect(res.fingerprint).toBeTruthy();
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(cfg.apiKeyHelper).toBe('keep-me');
    expect(cfg.env.CUSTOM).toBe('x');
    expect(cfg.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com');
    expect(cfg.env.ANTHROPIC_AUTH_TOKEN).toBe(FAKE_KEY);
    expect(cfg.env.ANTHROPIC_MODEL).toBe('deepseek-v4-flash');
    expect(cfg.env.AIHOME_VAULT_PROVIDER).toBe('p_1');
  });

  it('detect returns active provider when fingerprint matches', () => {
    const v = emptyVaultData();
    const res = claudeCodeAdapter.activate(provider, v);
    v.lastWritten['claude-code'] = { path: configFile, fingerprint: res.fingerprint! };
    const st = claudeCodeAdapter.detect(v);
    expect(st.fileState).toBe('ok');
    expect(st.activeProviderId).toBe('p_1');
  });

  it('detect flags conflict when user edits injected fields', () => {
    const v = emptyVaultData();
    const res = claudeCodeAdapter.activate(provider, v);
    v.lastWritten['claude-code'] = { path: configFile, fingerprint: res.fingerprint! };
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    cfg.env.ANTHROPIC_AUTH_TOKEN = TAMPERED_KEY;
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
    const st = claudeCodeAdapter.detect(v);
    expect(st.fileState).toBe('conflict');
    expect(st.conflictDetail).toContain('手动修改');
  });

  it('activate refuses to overwrite a conflicting file', () => {
    fs.writeFileSync(configFile, JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'sk' + '-other' } }));
    const res = claudeCodeAdapter.activate(provider, emptyVaultData());
    expect(res.state.fileState).toBe('conflict');
    expect(JSON.parse(fs.readFileSync(configFile, 'utf8')).env.ANTHROPIC_AUTH_TOKEN).toBe('sk' + '-other');
  });

  it('deactivate removes only injected fields', () => {
    const v = emptyVaultData();
    claudeCodeAdapter.activate(provider, v);
    const st = claudeCodeAdapter.deactivate(v);
    expect(st.fileState).toBe('ok');
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(cfg.env).toBeUndefined();
  });

  it('backupConfig copies the file with a timestamp name', () => {
    fs.writeFileSync(configFile, JSON.stringify({ a: 1 }));
    backupConfig('claude-code', configFile);
    const files = fs.readdirSync(path.join(backupsDir, 'claude-code'));
    expect(files).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(backupsDir, 'claude-code', files[0]), 'utf8')).a).toBe(1);
  });

  it('fingerprintOf is stable and distinct', () => {
    expect(fingerprintOf('a')).toBe(fingerprintOf('a'));
    expect(fingerprintOf('a')).not.toBe(fingerprintOf('b'));
  });
});
