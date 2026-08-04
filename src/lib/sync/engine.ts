import { readdir, mkdir, writeFile, rename, access } from 'fs/promises';
import * as path from 'path';
import { commonDir, metadataFile, repoDir } from './paths';
import { getEndpoints } from './config';
import { dirSha256, isSkillDir, scanSkills, atomicCopy } from './checksum';
import { loadMetadata, saveMetadata, renderManifest, nowIso } from './metadata';
import { gitCommit } from './git';

export interface SyncAction {
  kind: 'collect' | 'push' | 'skip';
  message: string;
}

export interface CollectStats {
  new: number;
  updated: number;
  conflict: number;
  skipped: number;
}

export interface CollectResult {
  stats: CollectStats;
  actions: SyncAction[];
  warnings: string[];
}

export async function resolveEndpoints(only?: string[]): Promise<Record<string, string>> {
  const endpoints = await getEndpoints();
  if (only === undefined || only.length === 0) return endpoints;
  const unknown = only.filter((n) => !(n in endpoints));
  if (unknown.length > 0) throw new Error(`未知端名: ${unknown.join(', ')}`);
  const selected: Record<string, string> = {};
  for (const name of Object.keys(endpoints).sort()) {
    if (only.includes(name)) selected[name] = endpoints[name];
  }
  return selected;
}

export async function collect(only?: string[], dryRun = false): Promise<CollectResult> {
  const endpoints = await resolveEndpoints(only);
  const meta = await loadMetadata(metadataFile());
  const skills = meta.skills;
  await mkdir(commonDir(), { recursive: true });
  const stats: CollectStats = { new: 0, updated: 0, conflict: 0, skipped: 0 };
  const actions: SyncAction[] = [];
  const warnings: string[] = [];

  for (const [endpoint, endpointPath] of Object.entries(endpoints).sort()) {
    let remote: Record<string, string>;
    try {
      remote = await scanSkills(endpointPath);
    } catch (err) {
      warnings.push(`端 ${endpoint} 处理失败: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (Object.keys(remote).length === 0) {
      // 与 Python 一致：缺失路径记 warning 跳过；存在但无技能则静默跳过（不创建目录）
      try {
        await access(endpointPath);
      } catch {
        warnings.push(`端 ${endpoint} 路径不存在: ${endpointPath}`);
        continue;
      }
      continue;
    }
    for (const name of Object.keys(remote).sort()) {
      const sha = remote[name];
      const src = path.join(endpointPath, name);
      const existing = path.join(commonDir(), name);
      let destName: string;
      if (await isSkillDir(existing)) {
        if ((await dirSha256(existing)) === sha) {
          stats.skipped += 1;
          const entry = skills[name] ?? { sha256: sha, sources: [], updated_at: nowIso() };
          entry.sha256 = sha;
          entry.updated_at = nowIso();
          if (!entry.sources.includes(endpoint)) entry.sources.push(endpoint);
          skills[name] = entry;
          continue;
        }
        const entry = skills[name] ?? { sha256: sha, sources: [], updated_at: nowIso() };
        entry.conflicts = entry.conflicts ?? {};
        entry.conflicts[endpoint] = sha;
        skills[name] = entry;
        stats.conflict += 1;
        destName = `${name}@${endpoint}`;
      } else {
        stats.new += 1;
        destName = name;
        const entry = skills[name] ?? { sha256: sha, sources: [], updated_at: nowIso() };
        entry.sha256 = sha;
        entry.updated_at = nowIso();
        if (!entry.sources.includes(endpoint)) entry.sources.push(endpoint);
        skills[name] = entry;
      }
      actions.push({ kind: 'collect', message: `collect ${endpoint}:${name} -> common/${destName}` });
      if (!dryRun) {
        await atomicCopy(src, path.join(commonDir(), destName));
      }
    }
  }

  if (!dryRun) {
    await saveMetadata(meta, metadataFile());
    const manifest = renderManifest(meta);
    const manifestFile = path.join(repoDir(), 'MANIFEST.md');
    const tmpFile = `${manifestFile}.tmp`;
    await writeFile(tmpFile, manifest, 'utf-8');
    await rename(tmpFile, manifestFile);
    await gitCommit(repoDir(), `sync: collect ${stats.new} new, ${stats.updated} updated, ${stats.conflict} conflict`);
  }
  return { stats, actions, warnings };
}
