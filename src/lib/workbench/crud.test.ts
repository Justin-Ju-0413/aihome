import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  createSite, getSite, updateSite, deleteSite,
  listKeys, saveKey, deleteKey, setCurrentKey,
  getCurrentKeyRecord, getKeyRecord, clearAllKeys, maskKey, recordKeyCheck,
  getSettings, updateSettings, setLastFullRefreshAt,
} from './crud';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'wb-crud-'));
  process.env.AIHOME_WORKBENCH_DB = path.join(dir, 'test.db');
});
afterEach(() => {
  // 关闭单例连接，避免跨测试复用已删除旧目录的只读连接
  const g = globalThis as { __workbenchDb?: { isOpen: boolean; close: () => void } };
  if (g.__workbenchDb?.isOpen) g.__workbenchDb.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.AIHOME_WORKBENCH_DB;
});

const siteInput = { name: 'DeepSeek 开放平台', url: 'https://platform.deepseek.com', category: 'API平台', tags: ['api', 'deepseek'] };

describe('maskKey', () => {
  it('masks long keys to prefix + last 4', () => {
    expect(maskKey('sk-abcdefghijkl')).toBe('sk-***ijkl');
  });
  it('masks short keys keeping last 2', () => {
    expect(maskKey('abc123')).toBe('***23');
  });
});

describe('sites crud', () => {
  it('creates site with slug id from name', () => {
    const site = createSite(siteInput);
    expect(site.id).toBe('deepseek-开放平台');
    expect(getSite(site.id)?.name).toBe('DeepSeek 开放平台');
  });
  it('dedupes slug collision with numeric suffix', () => {
    createSite(siteInput);
    const second = createSite(siteInput);
    expect(second.id).toBe('deepseek-开放平台-2');
  });
  it('updates and deletes site', () => {
    const site = createSite(siteInput);
    const updated = updateSite(site.id, { category: '对话' });
    expect(updated?.category).toBe('对话');
    expect(deleteSite(site.id)).toBe(true);
    expect(getSite(site.id)).toBeNull();
  });
  it('validates url scheme', () => {
    expect(() => createSite({ name: 'x', url: 'ftp://bad' })).toThrow(/http/);
  });
});

describe('keys crud', () => {
  it('saves key with mask-only view and marks first key current', () => {
    const site = createSite(siteInput);
    const view = saveKey(site.id, { label: '主 key', provider: 'deepseek', key: 'sk-long-secret-1234' });
    expect(view.masked).toBe('sk-***1234');
    expect(view.isCurrent).toBe(true);
    expect(listKeys(site.id)[0].masked).toBe('sk-***1234');
    const rec = getCurrentKeyRecord(site.id);
    expect(rec?.key).toBe('sk-long-secret-1234');
  });
  it('new key becomes current; switching current key works', () => {
    const site = createSite(siteInput);
    const k1 = saveKey(site.id, { label: 'a', provider: 'deepseek', key: 'sk-a' });
    expect(k1.isCurrent).toBe(true);
    const k2 = saveKey(site.id, { label: 'b', provider: 'deepseek', key: 'sk-b' });
    expect(k2.isCurrent).toBe(true); // 新保存的 key 自动成为当前
    expect(getCurrentKeyRecord(site.id)?.id).toBe(k2.id);
    expect(listKeys(site.id).find((k) => k.id === k1.id)?.isCurrent).toBe(false);
    setCurrentKey(site.id, k1.id);
    expect(getCurrentKeyRecord(site.id)?.id).toBe(k1.id);
    expect(listKeys(site.id).find((k) => k.id === k2.id)?.isCurrent).toBe(false);
  });
  it('deletes key and clears all keys', () => {
    const site = createSite(siteInput);
    const k = saveKey(site.id, { label: 'a', provider: 'deepseek', key: 'sk-a' });
    expect(deleteKey(k.id)).toBe(true);
    saveKey(site.id, { label: 'b', provider: 'deepseek', key: 'sk-b' });
    expect(clearAllKeys()).toBe(1);
    expect(listKeys(site.id)).toHaveLength(0);
  });
  it('records check status', () => {
    const site = createSite(siteInput);
    const k = saveKey(site.id, { label: 'a', provider: 'deepseek', key: 'sk-a' });
    recordKeyCheck(k.id, 'ok', JSON.stringify({ balances: [{ currency: 'CNY', total: '10.00' }] }));
    const view = listKeys(site.id)[0];
    expect(view.lastCheckStatus).toBe('ok');
    expect(JSON.parse(view.lastBalanceJson!).balances[0].total).toBe('10.00');
  });
  it('getKeyRecord returns plaintext key', () => {
    const site = createSite(siteInput);
    const k = saveKey(site.id, { label: 'a', provider: 'deepseek', key: 'sk-secret-xyz' });
    const rec = getKeyRecord(k.id);
    expect(rec?.key).toBe('sk-secret-xyz');
  });
  it('stores keys encrypted at rest', () => {
    const site = createSite(siteInput);
    const k = saveKey(site.id, { label: 'a', provider: 'deepseek', key: 'sk-at-rest-check' });
    const raw = new DatabaseSync(process.env.AIHOME_WORKBENCH_DB!);
    const stored = raw.prepare('SELECT key_encrypted FROM keys WHERE id = ?').get(k.id) as { key_encrypted: string };
    raw.close();
    expect(stored.key_encrypted).toMatch(/^enc:v1:/);
    expect(stored.key_encrypted).not.toContain('sk-at-rest-check');
  });
  it('migrates legacy plaintext key to encrypted on read', () => {
    const site = createSite(siteInput);
    // 模拟旧版库：绕过 saveKey 直接插明文
    const raw = new DatabaseSync(process.env.AIHOME_WORKBENCH_DB!);
    const inserted = raw.prepare(
      `INSERT INTO keys (site_id, label, provider, key_encrypted, is_current, created_at)
       VALUES (?, '旧', 'deepseek', ?, 1, ?)`
    ).run(site.id, 'sk-legacy-plaintext', new Date().toISOString());
    raw.close();

    const rec = getKeyRecord(Number(inserted.lastInsertRowid));
    expect(rec?.key).toBe('sk-legacy-plaintext');

    // 读取后库内应已加密，且不再含明文
    const raw2 = new DatabaseSync(process.env.AIHOME_WORKBENCH_DB!);
    const stored = raw2.prepare('SELECT key_encrypted FROM keys WHERE id = ?').get(rec!.id) as { key_encrypted: string };
    raw2.close();
    expect(stored.key_encrypted).toMatch(/^enc:v1:/);
  });
});

describe('settings', () => {
  it('returns defaults then persists updates', () => {
    expect(getSettings()).toEqual({ autoRefreshEnabled: false, refreshIntervalMin: 30, lastFullRefreshAt: null });
    updateSettings({ autoRefreshEnabled: true, refreshIntervalMin: 60 });
    expect(getSettings().autoRefreshEnabled).toBe(true);
    setLastFullRefreshAt('2026-08-10T08:00:00.000Z');
    expect(getSettings().lastFullRefreshAt).toBe('2026-08-10T08:00:00.000Z');
  });
});
