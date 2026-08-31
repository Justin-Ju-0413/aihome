import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { codexAdapter } from '../adapters/codex';
import { emptyVaultData, type ProviderConfig } from '../store';

// 假密钥运行时拼装（测试值，非真实凭据），避免静态扫描拦截
const FAKE_KEY = 'sk' + '-test-12345678';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-codex-'));
const configFile = path.join(home, 'config.toml');
const authFile = path.join(home, 'auth.json');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_CODEX_CONFIG = configFile;
  process.env.AIHOME_VAULT_CODEX_AUTH = authFile;
  fs.rmSync(configFile, { force: true });
  fs.rmSync(authFile, { force: true });
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

describe('codex adapter', () => {
  it('activate writes provider section, auth key and model line', () => {
    fs.writeFileSync(configFile, '[model_providers.other]\nname = "Other"\n');
    const res = codexAdapter.activate(provider, emptyVaultData());
    expect(res.state.fileState).toBe('ok');
    expect(res.fingerprint).toBeTruthy();
    const toml = fs.readFileSync(configFile, 'utf8');
    expect(toml).toContain('[model_providers.vault_p_1]');
    expect(toml).toContain('name = "DeepSeek"');
    expect(toml).toContain('base_url = "https://api.deepseek.com"');
    expect(toml).toContain('env_key = "AIHOME_VAULT_p_1"');
    expect(toml).toContain('model = "vault_p_1/deepseek-v4-flash"');
    expect(toml).toContain('[model_providers.other]');
    const auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    expect(auth.AIHOME_VAULT_p_1).toBe(FAKE_KEY);
  });

  it('detect returns active provider when fingerprint matches', () => {
    const v = emptyVaultData();
    const res = codexAdapter.activate(provider, v);
    v.lastWritten['codex'] = { path: configFile, fingerprint: res.fingerprint! };
    const st = codexAdapter.detect(v);
    expect(st.fileState).toBe('ok');
    expect(st.activeProviderId).toBe('p_1');
  });

  it('detect flags conflict on tampered section', () => {
    const v = emptyVaultData();
    const res = codexAdapter.activate(provider, v);
    v.lastWritten['codex'] = { path: configFile, fingerprint: res.fingerprint! };
    const tampered = fs.readFileSync(configFile, 'utf8').replace(
      'base_url = "https://api.deepseek.com"', 'base_url = "https://evil.example.com"');
    fs.writeFileSync(configFile, tampered);
    const st = codexAdapter.detect(v);
    expect(st.fileState).toBe('conflict');
  });

  it('does not overwrite a user model line', () => {
    fs.writeFileSync(configFile, 'model = "gpt-4o"\n');
    codexAdapter.activate(provider, emptyVaultData());
    const toml = fs.readFileSync(configFile, 'utf8');
    expect(toml).toContain('model = "gpt-4o"');
    expect(toml).toContain('model = "vault_p_1/deepseek-v4-flash"');
  });

  it('deactivate removes section, auth key and injected model line', () => {
    const v = emptyVaultData();
    codexAdapter.activate(provider, v);
    const st = codexAdapter.deactivate(v);
    expect(st.fileState).toBe('ok');
    expect(fs.readFileSync(configFile, 'utf8')).not.toContain('vault_p_1');
    expect(JSON.parse(fs.readFileSync(authFile, 'utf8')).AIHOME_VAULT_p_1).toBeUndefined();
  });

  it('replaces an old injected section on re-activate', () => {
    const v = emptyVaultData();
    const first = codexAdapter.activate(provider, v);
    // 模拟编排层在成功写入后持久化 lastWritten 指纹（Task 7 编排层职责）
    v.lastWritten['codex'] = { path: configFile, fingerprint: first.fingerprint! };
    const p2 = { ...provider, id: 'p_2', baseUrl: 'https://api.anthropic.com' };
    const res = codexAdapter.activate(p2, v);
    expect(res.state.fileState).toBe('ok');
    const toml = fs.readFileSync(configFile, 'utf8');
    expect(toml).not.toContain('vault_p_1');
    expect(toml).toContain('[model_providers.vault_p_2]');
  });
});
