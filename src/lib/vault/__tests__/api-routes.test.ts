import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NextRequest } from 'next/server';
import { GET as statusGet } from '@/app/api/vault/status/route';
import { POST as unlockPost } from '@/app/api/vault/unlock/route';
import { POST as lockPost } from '@/app/api/vault/lock/route';
import { POST as providersPost } from '@/app/api/vault/providers/route';
import { DELETE as providerDelete } from '@/app/api/vault/providers/[id]/route';
import { POST as activatePost } from '@/app/api/vault/activate/route';
import { lock } from '../store';

// 假密钥运行时拼装（测试值，非真实凭据），避免静态扫描拦截
const FAKE_KEY = 'sk' + '-test-12345678';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-api-'));
const vaultFile = path.join(dir, 'vault.enc');
const ccConfig = path.join(dir, 'settings.json');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_FILE = vaultFile;
  process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG = ccConfig;
  fs.rmSync(vaultFile, { force: true });
  fs.rmSync(ccConfig, { force: true });
  lock();
});

afterAll(() => {
  process.env = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(url, init);

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe('vault API routes', () => {
  it('status reports locked by default', async () => {
    const res = await json(await statusGet(req('http://localhost/api/vault/status')));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.firstTime).toBe(true);
  });

  it('unlock with wrong password returns 401', async () => {
    await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'correct-pass' }) }));
    await lockPost(req('http://localhost/api/vault/lock', { method: 'POST' }));
    const res = await json(await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'wrong-pass-123' }) })));
    expect(res.status).toBe(401);
  });

  it('first unlock creates vault; add provider; masked in status', async () => {
    await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'my-password-1' }) }));
    const res = await json(await providersPost(req('http://localhost/api/vault/providers', {
      method: 'POST', body: JSON.stringify({ name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: FAKE_KEY }),
    })));
    expect(res.status).toBe(200);
    const st = await json(await statusGet(req('http://localhost/api/vault/status')));
    expect(st.body.locked).toBe(false);
    expect(st.body.firstTime).toBe(false);
    expect(st.body.providers[0].apiKeyMasked).toBe('sk-***5678');
    expect(st.body.providers[0].apiKey).toBeUndefined();
    expect(st.body.tools.find((t: { id: string }) => t.id === 'claude-code').activeProviderId).toBeNull();
  });

  it('activate writes tool config and updates status', async () => {
    await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'my-password-1' }) }));
    const p = await json(await providersPost(req('http://localhost/api/vault/providers', {
      method: 'POST', body: JSON.stringify({ name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: FAKE_KEY }),
    })));
    const id = p.body.provider.id;
    const act = await json(await activatePost(req('http://localhost/api/vault/activate', {
      method: 'POST', body: JSON.stringify({ tool: 'claude-code', providerId: id }),
    })));
    expect(act.status).toBe(200);
    const cfg = JSON.parse(fs.readFileSync(ccConfig, 'utf8'));
    expect(cfg.env.AIHOME_VAULT_PROVIDER).toBe(id);
    const st = await json(await statusGet(req('http://localhost/api/vault/status')));
    expect(st.body.tools.find((t: { id: string }) => t.id === 'claude-code').activeProviderId).toBe(id);
  });

  it('locked writes return 423', async () => {
    const res = await json(await providersPost(req('http://localhost/api/vault/providers', {
      method: 'POST', body: JSON.stringify({ name: 'X', baseUrl: 'https://x.com', model: 'm', apiKey: FAKE_KEY }),
    })));
    expect(res.status).toBe(423);
  });

  it('delete provider in use returns 409', async () => {
    await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'my-password-1' }) }));
    const p = await json(await providersPost(req('http://localhost/api/vault/providers', {
      method: 'POST', body: JSON.stringify({ name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'm', apiKey: FAKE_KEY }),
    })));
    const id = p.body.provider.id;
    await activatePost(req('http://localhost/api/vault/activate', { method: 'POST', body: JSON.stringify({ tool: 'claude-code', providerId: id }) }));
    const del = await json(await providerDelete(req(`http://localhost/api/vault/providers/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) }));
    expect(del.status).toBe(409);
  });
});
