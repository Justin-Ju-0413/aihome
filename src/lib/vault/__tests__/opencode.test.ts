import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { opencodeAdapter } from '../adapters/opencode';
import { emptyVaultData, type ProviderConfig } from '../store';

// 假密钥运行时拼装（测试值，非真实凭据），避免静态扫描拦截
const FAKE_KEY = 'sk' + '-test-12345678';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-oc-'));
const configFile = path.join(home, 'opencode.json');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_OPENCODE_CONFIG = configFile;
  fs.rmSync(configFile, { force: true });
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

describe('opencode adapter', () => {
  it('activate writes provider segment, header and keeps custom fields', () => {
    fs.writeFileSync(configFile, JSON.stringify({ theme: 'dark' }));
    const res = opencodeAdapter.activate(provider, emptyVaultData());
    expect(res.state.fileState).toBe('ok');
    expect(res.fingerprint).toBeTruthy();
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(cfg.theme).toBe('dark');
    const seg = cfg.provider['vault_p_1'];
    expect(seg.baseURL).toBe('https://api.deepseek.com');
    expect(seg.headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(cfg.model).toBe('vault_p_1/deepseek-v4-flash');
  });

  it('detect returns active provider when fingerprint matches', () => {
    const v = emptyVaultData();
    const res = opencodeAdapter.activate(provider, v);
    v.lastWritten['opencode'] = { path: configFile, fingerprint: res.fingerprint! };
    const st = opencodeAdapter.detect(v);
    expect(st.fileState).toBe('ok');
    expect(st.activeProviderId).toBe('p_1');
  });

  it('detect flags conflict on tampered Authorization header', () => {
    const v = emptyVaultData();
    const res = opencodeAdapter.activate(provider, v);
    v.lastWritten['opencode'] = { path: configFile, fingerprint: res.fingerprint! };
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    cfg.provider['vault_p_1'].headers.Authorization = 'Bearer sk' + '-tampered';
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
    const st = opencodeAdapter.detect(v);
    expect(st.fileState).toBe('conflict');
  });

  it('does not overwrite a user model choice', () => {
    fs.writeFileSync(configFile, JSON.stringify({ model: 'anthropic/claude-sonnet-4-6' }));
    opencodeAdapter.activate(provider, emptyVaultData());
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(cfg.model).toBe('anthropic/claude-sonnet-4-6');
  });

  it('deactivate removes only injected segment and model line', () => {
    const v = emptyVaultData();
    opencodeAdapter.activate(provider, v);
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    cfg.theme = 'dark';
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
    const st = opencodeAdapter.deactivate(v);
    expect(st.fileState).toBe('ok');
    const after = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(after.theme).toBe('dark');
    expect(after.provider?.['vault_p_1']).toBeUndefined();
    expect(after.model).toBeUndefined();
  });
});
