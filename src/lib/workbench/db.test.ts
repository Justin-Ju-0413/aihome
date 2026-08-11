import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openWorkbenchDb, schemaVersion } from './db';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'wb-db-'));
  process.env.AIHOME_WORKBENCH_DB = path.join(dir, 'test.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.AIHOME_WORKBENCH_DB;
});

describe('db', () => {
  it('creates db file and all v1 tables on first open', () => {
    const db = openWorkbenchDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => String(r.name));
    expect(tables).toContain('sites');
    expect(tables).toContain('keys');
    expect(tables).toContain('settings');
    expect(schemaVersion(db)).toBe(1);
    expect(existsSync(path.join(dir, 'test.db'))).toBe(true);
    db.close();
  });

  it('is idempotent across reopen', () => {
    const db1 = openWorkbenchDb();
    db1.close();
    const db2 = openWorkbenchDb();
    expect(schemaVersion(db2)).toBe(1);
    expect(
      db2.prepare("SELECT count(*) AS c FROM sqlite_master WHERE name='sites'").get() as { c: number }
    ).toEqual({ c: 1 });
    db2.close();
  });

  it('keys table cascades deletes from sites', () => {
    const db = openWorkbenchDb();
    db.prepare("INSERT INTO sites (id, name, url, category, is_builtin, created_at, updated_at) VALUES ('s1','S1','https://x.com','对话',0,'2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z')").run();
    db.prepare("INSERT INTO keys (site_id, provider, key_encrypted, created_at) VALUES ('s1','deepseek','sk-abc','2026-08-10T00:00:00.000Z')").run();
    db.prepare("DELETE FROM sites WHERE id='s1'").run();
    const leftover = db.prepare("SELECT count(*) AS c FROM keys WHERE site_id='s1'").get() as { c: number };
    expect(leftover.c).toBe(0);
    db.close();
  });
});
