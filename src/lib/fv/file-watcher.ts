import * as path from 'path';
import * as chokidar from 'chokidar';
import { stmts } from './db';
import { getValues } from './settings';
import { emitEvent } from './events';

/**
 * chokidar 文件监听（原 file-watcher.js 移植）。
 * 用 globalThis 单例防止 Next dev（Turbopack HMR）下重复初始化；
 * 惰性启动：首次文件树请求时 ensureWatcher()。
 */

const GLOBAL_KEY = '__fvFileWatcher__';

interface WatcherState {
  watcher: { close: () => Promise<void> } | null;
  dir: string | null;
}

function getState(): WatcherState {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { watcher: null, dir: null };
  return g[GLOBAL_KEY] as WatcherState;
}

export function ensureWatcher(dir: string): void {
  const vals = getValues();
  if (vals['workspace.watch_files'] === 'false') return;

  const state = getState();
  if (state.watcher && state.dir === dir) return;

  if (state.watcher) {
    void state.watcher.close().catch(() => {});
    state.watcher = null;
  }
  state.dir = dir;

  const ignoreStr = vals['workspace.watch_ignore'] || 'node_modules,.git,dist,build,.next';
  const ignorePatterns = ignoreStr.split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  ignorePatterns.push(/data\.db/, /\.db-shm/, /\.db-wal/, /coverage/);

  const stabilityThreshold = parseInt(vals['workspace.write_stability_threshold'] || '300');
  const pollInterval = parseInt(vals['workspace.write_poll_interval'] || '100');

  const watcher = chokidar.watch(dir, {
    ignored: ignorePatterns,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold, pollInterval },
  });

  watcher.on('add', (filePath: string) => broadcastChange('add', filePath));
  watcher.on('change', (filePath: string) => broadcastChange('change', filePath));
  watcher.on('unlink', (filePath: string) => broadcastChange('unlink', filePath));

  state.watcher = watcher;
}

export function stopWatcher(): void {
  const state = getState();
  if (state.watcher) {
    void state.watcher.close().catch(() => {});
    state.watcher = null;
    state.dir = null;
  }
}

function broadcastChange(eventType: string, filePath: string): void {
  emitEvent({ type: 'file:change', event: eventType, path: filePath, timestamp: Date.now() });
  try {
    stmts.insertHistory({
      type: eventType === 'add' ? 'create' : eventType === 'unlink' ? 'delete' : 'edit',
      title: `${eventType === 'add' ? '新建' : eventType === 'unlink' ? '删除' : '修改'} ${path.basename(filePath)}`,
      description: filePath,
      agentId: null,
      filePath,
    });
  } catch {
    // 历史写入失败不影响监听
  }
}
