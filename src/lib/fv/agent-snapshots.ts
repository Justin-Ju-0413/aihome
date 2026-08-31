import * as crypto from 'crypto';
import * as fs from 'fs';
import { stmts } from './db';

/**
 * Agent 文件快照 / diff / 回滚。
 * 从 agent-runner 拆出，保持行为不变。
 */

export function createSnapshot(agentId: string, filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    stmts.insertSnapshot({ agentId, filePath, contentHash: hash, content });
    return hash;
  } catch {
    return null;
  }
}

export function generateDiff(agentId: string, filePath: string): string | null {
  try {
    const snapshots = stmts.getSnapshotsByAgent(agentId);
    const fileSnapshots = snapshots.filter((s) => s.file_path === filePath);
    if (fileSnapshots.length < 1) return null;

    const original = String(fileSnapshots[fileSnapshots.length - 1].content);
    const current = fs.readFileSync(filePath, 'utf-8');
    if (original === current) return null;

    const diff = computeSimpleDiff(original, current, filePath);
    const snapshotId = Number(fileSnapshots[fileSnapshots.length - 1].id);
    stmts.insertDiff({ agentId, filePath, diffContent: diff, snapshotId });
    return diff;
  } catch {
    return null;
  }
}

export function computeSimpleDiff(oldText: string, newText: string, filePath: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = i < oldLines.length ? oldLines[i] : null;
    const n = i < newLines.length ? newLines[i] : null;
    if (o === n) {
      lines.push(` ${o}`);
    } else {
      if (o !== null) lines.push(`-${o}`);
      if (n !== null) lines.push(`+${n}`);
    }
  }
  return lines.join('\n');
}

export function rollbackFile(filePath: string): boolean {
  const snap = stmts.getLatestSnapshot(filePath);
  if (!snap) return false;
  try {
    fs.writeFileSync(filePath, String(snap.content), 'utf-8');
    stmts.insertHistory({
      type: 'edit', title: `回滚 ${filePath}`,
      description: `Restored from snapshot #${snap.id}`,
      agentId: null, filePath,
    });
    return true;
  } catch {
    return false;
  }
}
