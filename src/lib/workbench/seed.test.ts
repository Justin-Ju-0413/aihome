import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seedBuiltins, restoreBuiltins, SEED_SITES } from './seed';
import { listSites, getSite, updateSite } from './crud';
import { openWorkbenchDb } from './db';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'wb-seed-'));
  process.env.AIHOME_WORKBENCH_DB = path.join(dir, 'test.db');
});
afterEach(() => {
  const g = globalThis as { __workbenchDb?: { isOpen: boolean; close: () => void } };
  if (g.__workbenchDb?.isOpen) g.__workbenchDb.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.AIHOME_WORKBENCH_DB;
});

describe('seed', () => {
  it('seeds all builtins on first run and is idempotent', () => {
    const first = seedBuiltins();
    expect(first).toBe(SEED_SITES.length);
    expect(seedBuiltins()).toBe(0);
    expect(listSites().length).toBe(SEED_SITES.length);
  });

  it('builtin sites are marked isBuiltin', () => {
    seedBuiltins();
    const all = listSites();
    expect(all.every((s) => s.isBuiltin)).toBe(true);
  });

  it('restore appends only missing builtins, never overwrites edited ones', () => {
    seedBuiltins();
    const first = listSites()[0];
    updateSite(first.id, { name: '我的改名' });
    expect(restoreBuiltins()).toBe(0);
    expect(getSite(first.id)?.name).toBe('我的改名');

    // 模拟用户删掉一个内置项后恢复
    const db = openWorkbenchDb();
    db.prepare("DELETE FROM sites WHERE id = (SELECT id FROM sites LIMIT 1)").run();
    expect(restoreBuiltins()).toBe(1);
  });
});
