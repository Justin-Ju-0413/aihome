import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Workbench 数据路径（对齐 src/lib/fv/paths.ts 惯例）。
 * DB 放用户级 ~/.aihome/ 下，测试/e2e 用 AIHOME_WORKBENCH_DB 重定向。
 */
export function workbenchDbPath(): string {
  return process.env.AIHOME_WORKBENCH_DB ?? path.join(os.homedir(), '.aihome', 'workbench.db');
}

/**
 * 旧版 ai-workbench 的 workbench.db，仅用于首次迁移（拷贝，不移动）。
 * 默认查找同级的 ai-workbench 项目目录，可用 AIHOME_WORKBENCH_LEGACY_DB 覆盖。
 */
export function legacyWorkbenchDbPath(): string {
  return (
    process.env.AIHOME_WORKBENCH_LEGACY_DB ??
    path.join(process.cwd(), '..', 'ai-workbench', 'data', 'workbench.db')
  );
}

const MIGRATIONS: string[] = [
  // V1
  `
  CREATE TABLE sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '其他',
    tags TEXT NOT NULL DEFAULT '[]',
    icon_url TEXT,
    notes TEXT NOT NULL DEFAULT '',
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '主 key',
    provider TEXT NOT NULL DEFAULT 'none',
    key_encrypted TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 0,
    last_check_status TEXT NOT NULL DEFAULT 'never',
    last_balance_json TEXT,
    last_check_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    auto_refresh_enabled INTEGER NOT NULL DEFAULT 0,
    refresh_interval_min INTEGER NOT NULL DEFAULT 30,
    last_full_refresh_at TEXT
  );
  `,
];

export function schemaVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

export function migrate(db: DatabaseSync): void {
  const current = schemaVersion(db);
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

// 首次打开：目标库不存在但旧版 ai-workbench 库存在 → 一次性拷贝（幂等，保留旧库不动）
function migrateLegacyDb(target: string): void {
  if (fs.existsSync(target)) return;
  const legacy = legacyWorkbenchDbPath();
  if (!fs.existsSync(legacy)) return;
  fs.copyFileSync(legacy, target);
}

function open(): DatabaseSync {
  const target = workbenchDbPath();
  // 显式指定 AIHOME_WORKBENCH_DB（测试/e2e）视为干净库，跳过 legacy 迁移；
  // 仅默认路径（真实使用）自动从旧 ai-workbench 库拷贝
  if (!process.env.AIHOME_WORKBENCH_DB) migrateLegacyDb(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

export function openWorkbenchDb(): DatabaseSync {
  const g = globalThis as { __workbenchDb?: DatabaseSync };
  if (!g.__workbenchDb || !g.__workbenchDb.isOpen) g.__workbenchDb = open();
  return g.__workbenchDb;
}

export function siteSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'site';
}

export function nowIso(): string {
  return new Date().toISOString();
}
