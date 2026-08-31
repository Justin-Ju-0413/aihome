import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---- mock chokidar：可控 watcher，捕获事件监听器 ----
const fakeWatchers: Array<{
  listeners: Map<string, Array<(...a: unknown[]) => void>>;
  close: ReturnType<typeof vi.fn>;
}> = [];
vi.mock('chokidar', () => ({
  watch: () => {
    const w = {
      listeners: new Map<string, Array<(...a: unknown[]) => void>>(),
      close: vi.fn(async () => {}),
    };
    fakeWatchers.push(w);
    return {
      on(ev: string, cb: (...a: unknown[]) => void) {
        if (!w.listeners.has(ev)) w.listeners.set(ev, []);
        w.listeners.get(ev)!.push(cb);
        return w;
      },
      close: w.close,
    };
  },
}));

import { resetDbForTests } from '../db';
import { ensureWatcher, stopWatcher } from '../file-watcher';

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-watch-heal-test-'));
const DB_FILE = path.join(DB_DIR, 'test.db');

beforeEach(() => {
  resetDbForTests();
  process.env.AIHOME_FV_DB = DB_FILE;
  process.env.AIHOME_FV_LEGACY_DB = path.join(DB_DIR, 'no-legacy.db');
  fakeWatchers.length = 0;
  stopWatcher();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  stopWatcher();
  resetDbForTests();
  delete process.env.AIHOME_FV_DB;
  delete process.env.AIHOME_FV_LEGACY_DB;
  fs.rmSync(DB_DIR, { recursive: true, force: true });
});

describe('file watcher error self-heal', () => {
  it('registers an error listener (node would crash otherwise)', () => {
    ensureWatcher('/tmp/heal');
    expect(fakeWatchers).toHaveLength(1);
    expect(fakeWatchers[0].listeners.has('error')).toBe(true);
  });

  it('does not throw on chokidar error, closes watcher and re-ensures after delay', () => {
    ensureWatcher('/tmp/heal');
    const w = fakeWatchers[0];
    const errorCb = w.listeners.get('error')![0];

    expect(() => errorCb(new Error('FS watcher exhausted (ENOSPC)'))).not.toThrow();
    expect(w.close).toHaveBeenCalled();

    // 2s 后自愈重建（再次 ensureWatcher 生成新 watcher）
    vi.advanceTimersByTime(2000);
    expect(fakeWatchers.length).toBeGreaterThanOrEqual(2);
  });


});
