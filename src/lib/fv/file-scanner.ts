import * as fs from 'fs';
import * as path from 'path';
import { stmts } from './db';
import { getValues } from './settings';

/** 文件树扫描与内容读取（原 file-scanner.js 移植） */

export interface FileNode {
  name: string;
  type: 'folder' | 'file';
  path: string;
  children?: FileNode[];
  ext?: string;
  size?: string;
  modified?: string;
  agentIds?: string[];
  opsCount?: number;
}

export function scanDirectory(dir: string, depth = 0, maxDepth: number | null = null): FileNode[] {
  const vals = getValues();
  const effectiveMaxDepth = maxDepth ?? parseInt(vals['workspace.max_scan_depth'] || '5');
  const showHidden = vals['workspace.show_hidden'] === 'true';
  const ignoreDirs = (vals['workspace.watch_ignore'] || 'node_modules,.git').split(',').map((s) => s.trim());

  if (depth > effectiveMaxDepth) return [];
  const results: FileNode[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith('.') && entry.name !== '.env') continue;
      if (ignoreDirs.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const children = scanDirectory(fullPath, depth + 1, effectiveMaxDepth);
        results.push({ name: entry.name, type: 'folder', path: fullPath, children });
      } else {
        const stat = fs.statSync(fullPath);
        const ext = path.extname(entry.name).slice(1) || 'file';
        const watch = stmts.getFileWatch(fullPath);
        results.push({
          name: entry.name,
          type: 'file',
          path: fullPath,
          ext,
          size: formatSize(stat.size),
          modified: formatTime(stat.mtime),
          agentIds: watch ? JSON.parse(String(watch.agent_ids)) : [],
          opsCount: watch ? Number(watch.ops_count) : 0,
        });
      }
    }
  } catch {
    // 无权限或目录不存在时静默返回空
  }

  return results.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function readFileContent(filePath: string): { content: string | null; size?: number; modified?: string; error?: string } {
  try {
    const vals = getValues();
    const maxKB = parseInt(vals['workspace.max_file_read_size'] || '512');
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * maxKB) return { content: null, error: `文件过大 (>${maxKB}KB)` };
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, size: stat.size, modified: stat.mtime.toISOString() };
  } catch (err) {
    return { content: null, error: (err as Error).message };
  }
}

export function watchFile(filePath: string, agentIds: string[]): void {
  stmts.upsertFileWatch({ path: filePath, agentIds: JSON.stringify(agentIds) });
}

export function getFileWatch(filePath: string): Record<string, unknown> | undefined {
  return stmts.getFileWatch(filePath);
}

export function listFileWatch(): Array<Record<string, unknown>> {
  return stmts.listFileWatch();
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
