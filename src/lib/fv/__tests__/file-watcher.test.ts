import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resetDbForTests, stmts } from '../db';
import { listEvents } from '../events';
import { ensureWatcher, stopWatcher } from '../file-watcher';

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-watcher-test-'));
const DB_FILE = path.join(DB_DIR, 'test.db');
let watchDir: string;

beforeEach(() => {
  resetDbForTests();
  fs.rmSync(DB_FILE, { force: true });
  process.env.AIHOME_FV_DB = DB_FILE;
  process.env.AIHOME_FV_LEGACY_DB = path.join(DB_DIR, 'no-legacy.db');
  watchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-watch-'));
  stopWatcher();
});

afterEach(() => {
  stopWatcher();
  resetDbForTests();
  delete process.env.AIHOME_FV_DB;
  delete process.env.AIHOME_FV_LEGACY_DB;
  fs.rmSync(watchDir, { recursive: true, force: true });
});

// chokidar awaitWriteFinish 默认 300ms 稳定阈值，等待事件最多 4s
async function waitForEvents(cursor: number, timeoutMs = 4000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { events, cursor: next } = listEvents(cursor);
    if (events.length > 0) return next;
    await new Promise((r) => setTimeout(r, 100));
  }
  return cursor;
}

describe('file watcher', () => {
  it('emits file:change events and writes history on add/change', async () => {
    const startCursor = listEvents(0).cursor; // 基线：跳过其他测试残留事件
    ensureWatcher(watchDir);
    await new Promise((r) => setTimeout(r, 300)); // 等 chokidar 就绪

    const target = path.join(watchDir, 'hello.txt');
    fs.writeFileSync(target, 'v1');

    const cursor = await waitForEvents(startCursor);
    expect(cursor).toBeGreaterThan(startCursor);
    const events = listEvents(startCursor).events;
    const change = events.find((e) => e.type === 'file:change' && e.path === target);
    expect(change).toBeTruthy();
    expect(change!.event).toBe('add');

    // 修改文件 → 第二条事件 + history 有 edit 记录
    fs.writeFileSync(target, 'v2');
    const cursor2 = await waitForEvents(cursor);
    expect(cursor2).toBeGreaterThan(cursor);
    const history = stmts.listHistory(10);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.some((h) => h.type === 'edit' && h.file_path === target)).toBe(true);
  });

  it('ignores configured ignore patterns (node_modules, .git)', async () => {
    const startCursor = listEvents(0).cursor;
    ensureWatcher(watchDir);
    await new Promise((r) => setTimeout(r, 300));
    fs.mkdirSync(path.join(watchDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(watchDir, 'node_modules', 'pkg.js'), 'x');
    fs.writeFileSync(path.join(watchDir, 'tracked.md'), 'y');

    const cursor = await waitForEvents(startCursor);
    expect(cursor).toBeGreaterThan(startCursor);
    const events = listEvents(startCursor).events.filter((e) => e.type === 'file:change');
    expect(events.some((e) => String(e.path).includes('node_modules'))).toBe(false);
    expect(events.some((e) => String(e.path).endsWith('tracked.md'))).toBe(true);
  });

  it('stopWatcher stops delivery', async () => {
    const startCursor = listEvents(0).cursor;
    ensureWatcher(watchDir);
    await new Promise((r) => setTimeout(r, 300));
    stopWatcher();
    fs.writeFileSync(path.join(watchDir, 'after-stop.txt'), 'x');
    await new Promise((r) => setTimeout(r, 800));
    expect(listEvents(startCursor).events.filter((e) => e.type === 'file:change')).toHaveLength(0);
  });
});
