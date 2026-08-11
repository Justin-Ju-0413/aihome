import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDb, resetDbForTests } from '../db';
import { DEFAULTS, initDefaults, getValues, getSetting, setSetting, validateSetting, exportSettings, importSettings, listAll, getCategories } from '../settings';

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-settings-test-'));

beforeEach(() => {
  resetDbForTests();
  process.env.AIHOME_FV_DB = path.join(DB_DIR, 'settings.db');
  // 防止自动迁移把真实的 file-visualizer/data.db 带进测试库
  process.env.AIHOME_FV_LEGACY_DB = path.join(DB_DIR, 'no-legacy.db');
  getDb();
  initDefaults();
});

afterEach(() => {
  resetDbForTests();
  delete process.env.AIHOME_FV_DB;
  delete process.env.AIHOME_FV_LEGACY_DB;
});

describe('fv settings', () => {
  it('initializes all defaults idempotently', () => {
    const values = getValues();
    expect(Object.keys(values).length).toBe(Object.keys(DEFAULTS).length);
    initDefaults(); // 再次调用不产生冲突
    expect(stmtsCount()).toBe(Object.keys(DEFAULTS).length);
  });

  function stmtsCount(): number {
    const db = getDb();
    return Number((db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }).n);
  }

  it('getSetting falls back to default and setSetting persists', () => {
    const before = getSetting('agent.max_concurrent');
    expect(before?.value).toBe('3');
    setSetting('agent.max_concurrent', '7');
    expect(getSetting('agent.max_concurrent')?.value).toBe('7');
    expect(getValues()['agent.max_concurrent']).toBe('7');
  });

  it('unknown setting returns null', () => {
    expect(getSetting('nope')).toBeNull();
  });

  it('validates port/range/path/directory', () => {
    expect(validateSetting('connection.server_port', '3210').valid).toBe(true);
    expect(validateSetting('connection.server_port', '99999').valid).toBe(false);
    expect(validateSetting('agent.max_concurrent', '11').valid).toBe(false);
    expect(validateSetting('agent.max_concurrent', '2').valid).toBe(true);

    // path: 不存在则验证失败；空值通过
    expect(validateSetting('connection.claude_path', '').valid).toBe(true);
    expect(validateSetting('connection.claude_path', '/definitely/not/a/real/cli').valid).toBe(false);

    // directory
    expect(validateSetting('workspace.default_dir', os.tmpdir()).valid).toBe(true);
    expect(validateSetting('workspace.default_dir', '/definitely/not/a/dir').valid).toBe(false);
  });

  it('export/import roundtrip skips unknown keys and invalid values', () => {
    const exported = exportSettings();
    expect(exported.version).toBe(1);
    expect(Object.keys((exported.values as Record<string, string>)).length).toBe(Object.keys(DEFAULTS).length);

    const imported = importSettings({
      values: {
        'agent.max_concurrent': '4',
        'unknown.key': 'x',
        'connection.server_port': 'not-a-port',
      },
    }) as { imported: number; skipped: number; errors: unknown[] };
    expect(imported.imported).toBe(1);
    expect(imported.skipped).toBe(2);
    expect(imported.errors).toHaveLength(1);
    expect(getValues()['agent.max_concurrent']).toBe('4');
  });

  it('lists categories and all settings with metadata', () => {
    expect(getCategories().map((c) => c.id)).toEqual(
      expect.arrayContaining(['appearance', 'agent', 'workspace', 'connection', 'privacy'])
    );
    const all = listAll();
    expect(all.length).toBe(Object.keys(DEFAULTS).length);
    const maxConcurrent = all.find((s) => s.key === 'agent.max_concurrent');
    expect(maxConcurrent?.type).toBe('range');
    expect(maxConcurrent?.min).toBe(1);
    expect(maxConcurrent?.max).toBe(10);
  });
});
