import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

import { GET as sitesGet, POST as sitesPost } from '@/app/api/workbench/sites/route';
import { PUT as sitePut, DELETE as siteDelete } from '@/app/api/workbench/sites/[id]/route';
import { POST as restorePost } from '@/app/api/workbench/sites/restore-builtins/route';
import { GET as keysGet, POST as keysPost } from '@/app/api/workbench/keys/route';
import { PUT as keyPut, DELETE as keyDelete } from '@/app/api/workbench/keys/[id]/route';
import { POST as setCurrentPost } from '@/app/api/workbench/keys/[id]/set-current/route';
import { POST as clearAllPost } from '@/app/api/workbench/keys/clear-all/route';
import { POST as balancePost } from '@/app/api/workbench/balance/[keyId]/route';
import { POST as refreshAllPost } from '@/app/api/workbench/balance/refresh-all/route';
import { GET as settingsGet, PUT as settingsPut } from '@/app/api/workbench/settings/route';
import { BALANCE_ADAPTERS } from '@/lib/workbench/balance/adapter';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'wb-api-'));
  process.env.AIHOME_WORKBENCH_DB = path.join(dir, 'test.db');
});

afterEach(() => {
  const g = globalThis as { __workbenchDb?: { isOpen: boolean; close: () => void } };
  if (g.__workbenchDb?.isOpen) g.__workbenchDb.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.AIHOME_WORKBENCH_DB;
  vi.restoreAllMocks();
});

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(url, init);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const keyParams = (keyId: string) => ({ params: Promise.resolve({ keyId }) });

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe('workbench API routes', () => {
  it('sites: first GET seeds builtins; POST creates custom site; PUT/DELETE work', async () => {
    const seeded = await sitesGet();
    expect(seeded.status).toBe(200);
    const body = await json(seeded);
    expect((body.sites as unknown[]).length).toBe(22);

    const created = await sitesPost(req('http://localhost/api/workbench/sites', {
      method: 'POST', body: JSON.stringify({ name: '测试站', url: 'https://example.com', category: '其他' }),
    }));
    expect(created.status).toBe(201);
    const site = (await json(created)).site as { id: string };

    const updated = await sitePut(req('http://localhost/api/workbench/sites/测试站', {
      method: 'PUT', body: JSON.stringify({ name: '测试站改' }),
    }), params(site.id));
    expect(updated.status).toBe(200);
    expect((await json(updated)).site).toMatchObject({ name: '测试站改' });

    const del = await siteDelete(req('http://localhost/api/workbench/sites/测试站'), params(site.id));
    expect((await json(del)).ok).toBe(true);
  });

  it('sites: rejects invalid url and missing fields', async () => {
    const bad = await sitesPost(req('http://localhost/api/workbench/sites', {
      method: 'POST', body: JSON.stringify({ name: 'x', url: 'ftp://bad' }),
    }));
    expect(bad.status).toBe(400);

    const missing = await sitesPost(req('http://localhost/api/workbench/sites', {
      method: 'POST', body: JSON.stringify({ name: 'x' }),
    }));
    expect(missing.status).toBe(400);
  });

  it('restore-builtins: adds only missing builtins', async () => {
    await sitesGet(); // 首启 seed
    const first = await restorePost();
    expect((await json(first)).added).toBe(0);
  });

  it('keys: save masks key, new key becomes current; set-current/clear-all work', async () => {
    await sitesGet(); // seed
    const saved = await keysPost(req('http://localhost/api/workbench/keys', {
      method: 'POST', body: JSON.stringify({ siteId: 'deepseek-开放平台', label: 'a', provider: 'deepseek', key: 'sk-secret-1234' }),
    }));
    expect(saved.status).toBe(201);
    const key = (await json(saved)).key as { id: number; masked: string; isCurrent: boolean };
    expect(key.masked).toBe('sk-***1234');
    expect(key.isCurrent).toBe(true);

    const list = await keysGet(req('http://localhost/api/workbench/keys?siteId=deepseek-开放平台'));
    const views = (await json(list)).keys as { masked: string }[];
    expect(views[0].masked).toBe('sk-***1234');
    expect(JSON.stringify(views)).not.toContain('sk-secret-1234'); // 无明文回显

    // 新 key 保存后成为当前
    const saved2 = await keysPost(req('http://localhost/api/workbench/keys', {
      method: 'POST', body: JSON.stringify({ siteId: 'deepseek-开放平台', label: 'b', provider: 'deepseek', key: 'sk-other-5678' }),
    }));
    const key2 = (await json(saved2)).key as { id: number; isCurrent: boolean };
    expect(key2.isCurrent).toBe(true);

    const sc = await setCurrentPost(req('http://localhost/api/workbench/keys/1/set-current', { method: 'POST' }), params(String(key.id)));
    expect((await json(sc)).ok).toBe(true);

    const upd = await keyPut(req('http://localhost/api/workbench/keys/1', {
      method: 'PUT', body: JSON.stringify({ label: '改' }),
    }), params(String(key.id)));
    expect((await json(upd)).key).toMatchObject({ label: '改' });

    const del = await keyDelete(req('http://localhost/api/workbench/keys/1'), params(String(key.id)));
    expect((await json(del)).ok).toBe(true);

    const clear = await clearAllPost();
    expect((await json(clear)).cleared).toBe(1);
  });

  it('balance: queries current key via adapter and persists status', async () => {
    await sitesGet(); // seed
    vi.spyOn(BALANCE_ADAPTERS.deepseek, 'query').mockResolvedValue({ ok: true, balances: [{ currency: 'CNY', total: '66.00' }] });
    const saved = await keysPost(req('http://localhost/api/workbench/keys', {
      method: 'POST', body: JSON.stringify({ siteId: 'deepseek-开放平台', provider: 'deepseek', key: 'sk-good' }),
    }));
    const key = (await json(saved)).key as { id: number };

    const res = await balancePost(req(`http://localhost/api/workbench/balance/${key.id}`, { method: 'POST' }), keyParams(String(key.id)));
    const { result } = await json(res);
    expect(result).toMatchObject({ ok: true });

    const list = await keysGet(req('http://localhost/api/workbench/keys?siteId=deepseek-开放平台'));
    const views = (await json(list)).keys as { lastCheckStatus: string }[];
    expect(views[0].lastCheckStatus).toBe('ok');
  });

  it('balance: unsupported provider maps to unsupported status', async () => {
    await sitesGet();
    const saved = await keysPost(req('http://localhost/api/workbench/keys', {
      method: 'POST', body: JSON.stringify({ siteId: 'chatgpt', provider: 'none', key: 'nokey' }),
    }));
    const key = (await json(saved)).key as { id: number };
    const res = await balancePost(req(`http://localhost/api/workbench/balance/${key.id}`, { method: 'POST' }), keyParams(String(key.id)));
    const { result } = await json(res);
    expect(result).toMatchObject({ ok: false, error: 'unsupported' });
  });

  it('balance refresh-all: returns summary', async () => {
    await sitesGet();
    vi.spyOn(BALANCE_ADAPTERS.deepseek, 'query').mockResolvedValue({ ok: true, balances: [{ currency: 'CNY', total: '1.00' }] });
    await keysPost(req('http://localhost/api/workbench/keys', {
      method: 'POST', body: JSON.stringify({ siteId: 'deepseek-开放平台', provider: 'deepseek', key: 'k1' }),
    }));
    const res = await refreshAllPost();
    const { summary } = await json(res);
    expect(summary).toMatchObject({ checked: 1, ok: 1 });
  });

  it('settings: returns defaults and persists updates', async () => {
    const res = await settingsGet();
    expect(await json(res)).toEqual({
      settings: { autoRefreshEnabled: false, refreshIntervalMin: 30, lastFullRefreshAt: null },
    });

    const updated = await settingsPut(req('http://localhost/api/workbench/settings', {
      method: 'PUT', body: JSON.stringify({ autoRefreshEnabled: true, refreshIntervalMin: 60 }),
    }));
    expect((await json(updated)).settings).toMatchObject({ autoRefreshEnabled: true, refreshIntervalMin: 60 });
  });
});
