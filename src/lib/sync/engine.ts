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
  const stats: CollectStats = { new: 0, conflict: 0, skipped: 0 };
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
    await mkdir(commonDir(), { recursive: true });
    await saveMetadata(meta, metadataFile());
    const manifest = renderManifest(meta);
    const manifestFile = path.join(repoDir(), 'MANIFEST.md');
    const tmpFile = `${manifestFile}.tmp`;
    await writeFile(tmpFile, manifest, 'utf-8');
    await rename(tmpFile, manifestFile);
    const git = await gitCommit(repoDir(), `sync: collect ${stats.new} new, ${stats.conflict} conflict, ${stats.skipped} skipped`);
    if (!git.ok) warnings.push(`git 提交失败（collect）: ${git.code ?? 'unknown'}`);
  }
  return { stats, actions, warnings };
}

export interface PushStats {
  updated: number;
  skipped: number;
}

export interface PushResult {
  stats: PushStats;
  actions: SyncAction[];
  warnings: string[];
}

export async function push(only?: string[], dryRun = false): Promise<PushResult> {
  const endpoints = await resolveEndpoints(only);
  const meta = await loadMetadata(metadataFile());
  const skills = meta.skills;
  const stats: PushStats = { updated: 0, skipped: 0 };
  const actions: SyncAction[] = [];
  const warnings: string[] = [];

  let commonNames: string[] = [];
  try {
    const items = await readdir(commonDir());
    for (const name of items.sort()) {
      if (name.startsWith('.') || name.includes('@')) continue;
      if (await isSkillDir(path.join(commonDir(), name))) commonNames.push(name);
    }
  } catch {
    commonNames = [];
  }

  for (const [endpoint, endpointPath] of Object.entries(endpoints).sort()) {
    try {
      if (!dryRun) await mkdir(endpointPath, { recursive: true });
      const remote = await scanSkills(endpointPath);
      for (const name of commonNames) {
        const entry = skills[name];
        if (entry && entry.conflicts !== undefined) {
          actions.push({ kind: 'skip', message: `skip ${endpoint}:${name}（存在冲突副本）` });
          continue;
        }
        const src = path.join(commonDir(), name);
        const dst = path.join(endpointPath, name);
        if (remote[name] === (await dirSha256(src))) {
          stats.skipped += 1;
          continue;
        }
        if (name in remote) {
          warnings.push(`${endpoint}:${name} 将被 common/ 版本覆盖（端上版本不同）`);
        }
        actions.push({ kind: 'push', message: `push ${name} -> ${endpoint}/` });
        stats.updated += 1;
        if (!dryRun) await atomicCopy(src, dst);
      }
    } catch (err) {
      warnings.push(`端 ${endpoint} 处理失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!dryRun) {
    const git = await gitCommit(repoDir(), `sync: push ${stats.updated} updated, ${stats.skipped} skipped`);
    if (!git.ok) warnings.push(`git 提交失败（push）: ${git.code ?? 'unknown'}`);
  }
  return { stats, actions, warnings };
}

export interface EndpointState {
  path: string;
  exists: boolean;
  count: number;
  diff: { missing: number; same: number; different: number; extra: number };
}

export interface SyncSkillState {
  name: string;
  sha256: string;
  sha8: string;
  sources: string[];
  updated_at: string;
  conflicts: Record<string, string>;
  endpoint_state: Record<string, string>;
}

export interface SyncConflict {
  name: string;
  versions: string[];
  sha256: string[];
  endpoint: string;
}

export interface SyncState {
  generated_at: string;
  summary: { total_skills: number; conflict_count: number; endpoint_count: number };
  endpoints: Record<string, EndpointState>;
  skills: SyncSkillState[];
  conflicts: SyncConflict[];
}

export async function buildState(): Promise<SyncState> {
  const meta = await loadMetadata(metadataFile());
  const skillsMeta = meta.skills;

  let commonNames: string[] = [];
  try {
    const items = await readdir(commonDir());
    for (const name of items.sort()) {
      if (name.startsWith('.') || name.includes('@')) continue;
      if (await isSkillDir(path.join(commonDir(), name))) commonNames.push(name);
    }
  } catch {
    commonNames = [];
  }

  const commonSha: Record<string, string | null> = {};
  for (const name of commonNames) {
    try {
      commonSha[name] = await dirSha256(path.join(commonDir(), name));
    } catch {
      commonSha[name] = null;
    }
  }

  const skills: SyncSkillState[] = commonNames.map((name) => {
    const entry = skillsMeta[name];
    const sha = entry?.sha256 ?? '';
    return {
      name,
      sha256: sha,
      sha8: sha.slice(0, 8),
      sources: entry?.sources ?? [],
      updated_at: entry?.updated_at ?? '',
      conflicts: entry?.conflicts ?? {},
      endpoint_state: {},
    };
  });

  const endpoints: Record<string, EndpointState> = {};
  for (const [endpoint, endpointPath] of Object.entries(await getEndpoints()).sort()) {
    let exists = false;
    try {
      await access(endpointPath);
      exists = true;
    } catch {
      exists = false;
    }
    const remote = exists ? await scanSkills(endpointPath) : {};
    const diff = { missing: 0, same: 0, different: 0, extra: 0 };
    for (const name of commonNames) {
      let state = 'missing';
      if (name in remote) {
        state = remote[name] === commonSha[name] ? 'same' : 'different';
      }
      diff[state as 'missing' | 'same' | 'different'] += 1;
    }
    for (const name of Object.keys(remote)) {
      if (!(name in commonSha)) diff.extra += 1;
    }
    endpoints[endpoint] = { path: endpointPath, exists, count: Object.keys(remote).length, diff };
    for (const skill of skills) {
      if (skill.name in remote) {
        skill.endpoint_state[endpoint] =
          remote[skill.name] === commonSha[skill.name] ? 'same' : 'different';
      } else {
        skill.endpoint_state[endpoint] = 'missing';
      }
    }
  }

  const conflicts: SyncConflict[] = [];
  for (const name of Object.keys(skillsMeta).sort()) {
    const entry = skillsMeta[name];
    const cfl = entry.conflicts ?? {};
    if (Object.keys(cfl).length > 0) {
      conflicts.push({
        name,
        versions: ['common/' + name, ...Object.keys(cfl).map((ep) => `common/${name}@${ep}`)],
        sha256: [entry.sha256 ?? '', ...Object.values(cfl)],
        endpoint: Object.keys(cfl)[0],
      });
    }
  }

  return {
    generated_at: nowIso(),
    summary: {
      total_skills: commonNames.length,
      conflict_count: conflicts.length,
      endpoint_count: Object.keys(endpoints).length,
    },
    endpoints,
    skills,
    conflicts,
  };
}
