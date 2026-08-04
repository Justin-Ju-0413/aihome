import { createHash } from 'crypto';
import { readdir, readFile, stat, access, mkdir, rename, rm, copyFile } from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';

export async function isSkillDir(dirPath: string): Promise<boolean> {
  const name = path.basename(dirPath);
  if (name.startsWith('.') || name.toLowerCase().endsWith('.zip')) return false;
  try {
    if (!(await stat(dirPath)).isDirectory()) return false;
    await access(path.join(dirPath, 'SKILL.md'));
    return true;
  } catch {
    return false;
  }
}

async function walkSorted(root: string): Promise<Array<[string, string[]]>> {
  const out: Array<[string, string[]]> = [];
  async function walk(dir: string, rel: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const files = entries
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => e.name);
    out.push([rel, files]);
    for (const entry of entries) {
      if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
      await walk(path.join(dir, entry.name), rel ? path.join(rel, entry.name) : entry.name);
    }
  }
  await walk(root, '');
  return out;
}

export async function dirSha256(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const [rel, files] of await walkSorted(root)) {
    for (const fname of files) {
      const relPath = rel ? path.join(rel, fname) : fname;
      hash.update(relPath, 'utf-8');
      hash.update('\x00', 'utf-8');
      hash.update(await readFile(path.join(root, rel, fname)));
    }
  }
  return hash.digest('hex');
}

export async function scanSkills(root: string): Promise<Record<string, string>> {
  let items;
  try {
    items = (await readdir(root)).sort();
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  for (const name of items) {
    const full = path.join(root, name);
    if (await isSkillDir(full)) {
      result[name] = await dirSha256(full);
    }
  }
  return result;
}

export async function copyTree(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  let items;
  try {
    items = await readdir(src, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of items) {
    if (entry.name === '.git' || entry.name.startsWith('.')) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyTree(s, d);
    } else {
      await copyFile(s, d);
    }
  }
}

export async function atomicCopy(src: string, dst: string): Promise<void> {
  const tmp = `${dst}.tmp-${process.pid}`;
  await rm(tmp, { recursive: true, force: true });
  await copyTree(src, tmp);
  await rm(dst, { recursive: true, force: true });
  await rename(tmp, dst);
}
