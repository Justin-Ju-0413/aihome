import { openWorkbenchDb, siteSlug, nowIso } from './db';
import { decryptKey, encryptKey, isEncrypted } from './crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Site, SiteInput, KeyRecord, KeyView, Settings, Provider, CheckStatus } from './types';

// node:sqlite 行类型（列名 snake_case）
interface SiteRow {
  id: string;
  name: string;
  url: string;
  category: string;
  tags: string;
  icon_url: string | null;
  notes: string;
  is_builtin: number;
  created_at: string;
  updated_at: string;
}

interface KeyRow {
  id: number;
  site_id: string;
  label: string;
  provider: string;
  key_encrypted: string;
  is_current: number;
  last_check_status: string;
  last_balance_json: string | null;
  last_check_at: string | null;
  created_at: string;
}

const ROW_TO_SITE = (r: SiteRow): Site => ({
  id: r.id, name: r.name, url: r.url, category: r.category,
  tags: JSON.parse(r.tags ?? '[]'), iconUrl: r.icon_url, notes: r.notes,
  isBuiltin: r.is_builtin === 1, createdAt: r.created_at, updatedAt: r.updated_at,
});

const ROW_TO_KEY_RECORD = (r: KeyRow): KeyRecord => ({
  id: r.id, siteId: r.site_id, label: r.label, provider: r.provider as Provider,
  key: r.key_encrypted, isCurrent: r.is_current === 1,
  lastCheckStatus: r.last_check_status as CheckStatus, lastBalanceJson: r.last_balance_json,
  lastCheckAt: r.last_check_at, createdAt: r.created_at,
});

export function maskKey(key: string): string {
  if (key.length <= 6) return `***${key.slice(-2)}`;
  const prefix = key.length > 9 ? key.slice(0, 3) : key.slice(0, 2);
  return `${prefix}***${key.slice(-4)}`;
}

// 掩码基于解密后的明文（库里是密文，直接掩码会显示乱码）；
// 解密失败（如主密钥变化）时兜底显示 `***`，不拖垮列表
const VIEW = (r: KeyRow): KeyView => {
  let masked: string;
  try {
    masked = maskKey(decryptKey(r.key_encrypted));
  } catch {
    masked = '***';
  }
  return {
    id: r.id, siteId: r.site_id, label: r.label, provider: r.provider as Provider,
    masked, isCurrent: r.is_current === 1,
    lastCheckStatus: r.last_check_status as CheckStatus, lastBalanceJson: r.last_balance_json,
    lastCheckAt: r.last_check_at,
  };
};

export function listSites(): Site[] {
  const db = openWorkbenchDb();
  return (db.prepare('SELECT * FROM sites ORDER BY category, name').all() as unknown as SiteRow[]).map(ROW_TO_SITE);
}

export function getSite(id: string): Site | null {
  const db = openWorkbenchDb();
  const row = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as unknown as SiteRow | undefined;
  return row ? ROW_TO_SITE(row) : null;
}

export function createSite(input: SiteInput): Site {
  if (!/^https?:\/\//.test(input.url)) throw new Error('url 必须以 http(s):// 开头');
  const db = openWorkbenchDb();
  const base = siteSlug(input.name);
  let id = base;
  for (let n = 2; getSite(id); n++) id = `${base}-${n}`;
  const ts = nowIso();
  db.prepare(
    `INSERT INTO sites (id, name, url, category, tags, icon_url, notes, is_builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, input.name, input.url, input.category ?? '其他', JSON.stringify(input.tags ?? []), input.iconUrl ?? null, input.notes ?? '', ts, ts);
  return getSite(id)!;
}

export function updateSite(id: string, input: Partial<SiteInput>): Site | null {
  if (!getSite(id)) return null;
  if (input.url !== undefined && !/^https?:\/\//.test(input.url)) throw new Error('url 必须以 http(s):// 开头');
  const db = openWorkbenchDb();
  const cur = getSite(id)!;
  const merged = {
    name: input.name ?? cur.name, url: input.url ?? cur.url,
    category: input.category ?? cur.category, tags: input.tags ?? cur.tags,
    iconUrl: input.iconUrl === undefined ? cur.iconUrl : input.iconUrl,
    notes: input.notes ?? cur.notes,
  };
  db.prepare(
    `UPDATE sites SET name=?, url=?, category=?, tags=?, icon_url=?, notes=?, updated_at=? WHERE id=?`
  ).run(merged.name, merged.url, merged.category, JSON.stringify(merged.tags), merged.iconUrl, merged.notes, nowIso(), id);
  return getSite(id);
}

export function deleteSite(id: string): boolean {
  if (!getSite(id)) return false;
  openWorkbenchDb().prepare('DELETE FROM sites WHERE id = ?').run(id);
  return true;
}

export function listKeys(siteId?: string): KeyView[] {
  const db = openWorkbenchDb();
  const rows = siteId
    ? db.prepare('SELECT * FROM keys WHERE site_id = ? ORDER BY id').all(siteId) as unknown as KeyRow[]
    : db.prepare('SELECT * FROM keys ORDER BY id').all() as unknown as KeyRow[];
  return rows.map(VIEW);
}

export function saveKey(siteId: string, input: { label: string; provider: Provider; key: string }): KeyView {
  const db = openWorkbenchDb();
  if (!getSite(siteId)) throw new Error('site 不存在');
  if (!input.key.trim()) throw new Error('key 不能为空');
  // 新保存的 key 自动成为当前 key（清除该平台其余 current 标志）
  db.prepare('UPDATE keys SET is_current = 0 WHERE site_id = ?').run(siteId);
  db.prepare(
    `INSERT INTO keys (site_id, label, provider, key_encrypted, is_current, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`
  ).run(siteId, input.label, input.provider, encryptKey(input.key.trim()), nowIso());
  const row = db.prepare('SELECT * FROM keys WHERE id = last_insert_rowid()').get() as unknown as KeyRow;
  return VIEW(row);
}

export function updateKey(id: number, input: { label?: string; key?: string }): KeyView | null {
  const db = openWorkbenchDb();
  const row = db.prepare('SELECT * FROM keys WHERE id = ?').get(id) as unknown as KeyRow | undefined;
  if (!row) return null;
  if (input.key !== undefined && !input.key.trim()) throw new Error('key 不能为空');
  db.prepare('UPDATE keys SET label = ?, key_encrypted = ? WHERE id = ?').run(
    input.label ?? row.label,
    input.key !== undefined ? encryptKey(input.key.trim()) : row.key_encrypted, id
  );
  return VIEW(db.prepare('SELECT * FROM keys WHERE id = ?').get(id) as unknown as KeyRow);
}

export function deleteKey(id: number): boolean {
  const db = openWorkbenchDb();
  const row = db.prepare('SELECT * FROM keys WHERE id = ?').get(id) as unknown as KeyRow | undefined;
  if (!row) return false;
  db.prepare('DELETE FROM keys WHERE id = ?').run(id);
  if (row.is_current === 1) {
    const next = db.prepare('SELECT id FROM keys WHERE site_id = ? ORDER BY id LIMIT 1').get(row.site_id) as unknown as { id: number } | undefined;
    if (next) db.prepare('UPDATE keys SET is_current = 1 WHERE id = ?').run(next.id);
  }
  return true;
}

export function setCurrentKey(siteId: string, keyId: number): void {
  const db = openWorkbenchDb();
  db.prepare('UPDATE keys SET is_current = 0 WHERE site_id = ?').run(siteId);
  db.prepare('UPDATE keys SET is_current = 1 WHERE id = ? AND site_id = ?').run(keyId, siteId);
}

export function getCurrentKeyRecord(siteId: string): KeyRecord | null {
  const db = openWorkbenchDb();
  const row = db.prepare('SELECT * FROM keys WHERE site_id = ? AND is_current = 1').get(siteId) as unknown as KeyRow | undefined;
  return row ? withPlaintextKey(db, row) : null;
}

export function getKeyRecord(id: number): KeyRecord | null {
  const db = openWorkbenchDb();
  const row = db.prepare('SELECT * FROM keys WHERE id = ?').get(id) as unknown as KeyRow | undefined;
  return row ? withPlaintextKey(db, row) : null;
}

/** 解密 + 旧明文自动迁移：读到的 key 返回明文（balance 查询用），同时把旧明文加密写回 */
function withPlaintextKey(db: DatabaseSync, row: KeyRow): KeyRecord {
  const rec = ROW_TO_KEY_RECORD(row);
  const stored = row.key_encrypted;
  if (isEncrypted(stored)) {
    rec.key = decryptKey(stored);
  } else {
    // 旧库明文（迁移前保存的 key）：加密写回，下次起不再落盘明文
    rec.key = stored;
    db.prepare('UPDATE keys SET key_encrypted = ? WHERE id = ?').run(encryptKey(stored), row.id);
  }
  return rec;
}

export function clearAllKeys(): number {
  return Number(openWorkbenchDb().prepare('DELETE FROM keys').run().changes);
}

export function recordKeyCheck(keyId: number, status: CheckStatus, balanceJson: string | null): void {
  openWorkbenchDb().prepare(
    'UPDATE keys SET last_check_status = ?, last_balance_json = ?, last_check_at = ? WHERE id = ?'
  ).run(status, balanceJson, nowIso(), keyId);
}

const DEFAULTS: Settings = { autoRefreshEnabled: false, refreshIntervalMin: 30, lastFullRefreshAt: null };

interface SettingsRow {
  auto_refresh_enabled: number;
  refresh_interval_min: number;
  last_full_refresh_at: string | null;
}

export function getSettings(): Settings {
  const db = openWorkbenchDb();
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as unknown as SettingsRow | undefined;
  if (!row) {
    db.prepare('INSERT INTO settings (id) VALUES (1)').run();
    return { ...DEFAULTS };
  }
  return {
    autoRefreshEnabled: row.auto_refresh_enabled === 1,
    refreshIntervalMin: row.refresh_interval_min,
    lastFullRefreshAt: row.last_full_refresh_at,
  };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const db = openWorkbenchDb();
  const cur = getSettings();
  const next = {
    autoRefreshEnabled: patch.autoRefreshEnabled ?? cur.autoRefreshEnabled,
    refreshIntervalMin: patch.refreshIntervalMin ?? cur.refreshIntervalMin,
    lastFullRefreshAt: patch.lastFullRefreshAt !== undefined ? patch.lastFullRefreshAt : cur.lastFullRefreshAt,
  };
  db.prepare(
    `INSERT INTO settings (id, auto_refresh_enabled, refresh_interval_min, last_full_refresh_at) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET auto_refresh_enabled=excluded.auto_refresh_enabled,
       refresh_interval_min=excluded.refresh_interval_min, last_full_refresh_at=excluded.last_full_refresh_at`
  ).run(next.autoRefreshEnabled ? 1 : 0, next.refreshIntervalMin, next.lastFullRefreshAt);
  return next;
}

export function setLastFullRefreshAt(iso: string): void {
  updateSettings({ lastFullRefreshAt: iso });
}
