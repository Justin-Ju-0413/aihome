// src/lib/scan-cache.ts
import type { AgentNode } from './types';

export interface ScanFingerprint {
  mtimeMs: number;
  size: number;
}

export interface ParseOutcome {
  node: AgentNode;
  depNames: string[];
}

export interface ScanStats {
  filesChecked: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface ScanDirEntry {
  count: AgentNode['associatedFiles'];
}

interface FileEntry {
  fp: ScanFingerprint;
  node: AgentNode;
  depNames: string[];
}

interface DirEntry {
  dirMtimeMs: number;
  count: AgentNode['associatedFiles'];
}

function plainCloneNode(n: AgentNode): AgentNode {
  return {
    ...n,
    // `?? []` 容忍最小化 stub 节点（如测试中的 `{ name: 'a' } as never`）；
    // 正式扫描产生的 node 恒为完整 AgentNode，此处对真实数据是行为中性的。
    dependencies: [...(n.dependencies ?? [])],
    calledBy: [...(n.calledBy ?? [])],
    position: { ...n.position },
  };
}

export class ScanCache {
  private files = new Map<string, FileEntry>();
  private dirs = new Map<string, DirEntry>();
  private current = { filesChecked: 0, cacheHits: 0, cacheMisses: 0 };

  fileFingerprint(p: { mtimeMs: number; size: number }): ScanFingerprint {
    return { mtimeMs: p.mtimeMs, size: p.size };
  }

  getFile(path: string, fp: ScanFingerprint): ParseOutcome | null {
    this.current.filesChecked += 1;
    const e = this.files.get(path);
    if (e && e.fp.mtimeMs === fp.mtimeMs && e.fp.size === fp.size) {
      this.current.cacheHits += 1;
      return { node: plainCloneNode(e.node), depNames: [...e.depNames] };
    }
    this.current.cacheMisses += 1;
    return null;
  }

  setFile(path: string, fp: ScanFingerprint, outcome: ParseOutcome): void {
    this.files.set(path, { fp, node: outcome.node, depNames: outcome.depNames });
  }

  getDir(dirPath: string, dirMtimeMs: number): ScanDirEntry | null {
    const e = this.dirs.get(dirPath);
    if (e && e.dirMtimeMs === dirMtimeMs) return { count: e.count };
    return null;
  }

  setDir(dirPath: string, dirMtimeMs: number, entry: ScanDirEntry): void {
    this.dirs.set(dirPath, { dirMtimeMs, count: entry.count });
  }

  get stats(): ScanStats {
    return { ...this.current };
  }
}