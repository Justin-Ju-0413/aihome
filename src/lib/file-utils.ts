import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import type { FileTreeNode } from './types';

export async function buildFileTree(dirPath: string, maxDepth: number = 3): Promise<FileTreeNode[]> {
  async function build(dir: string, depth: number): Promise<FileTreeNode[]> {
    if (depth > maxDepth) return [];
    
    const entries = await readdir(dir, { withFileTypes: true });
    const nodes: FileTreeNode[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const children = await build(fullPath, depth + 1);
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children
        });
      } else {
        const fileStat = await stat(fullPath);
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
          size: fileStat.size
        });
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  return build(dirPath, 0);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
