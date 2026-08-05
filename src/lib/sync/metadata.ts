import { readFile, writeFile, rename } from 'fs/promises';

export interface SkillMetaEntry {
  sha256: string;
  sources: string[];
  updated_at: string;
  conflicts?: Record<string, string>;
}

export interface SyncMetadata {
  version: 1;
  skills: Record<string, SkillMetaEntry>;
}

export interface SkillDiff {
  new: Array<[string, string]>;
  same: Array<[string, string]>;
  changed: Array<[string, string]>;
  conflict: Array<[string, string]>;
}

export function emptyMetadata(): SyncMetadata {
  return { version: 1, skills: {} };
}

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19) + '+00:00';
}

export async function loadMetadata(file: string): Promise<SyncMetadata> {
  try {
    const data = JSON.parse(await readFile(file, 'utf-8')) as Partial<SyncMetadata>;
    if (data && typeof data === 'object' && data.skills && typeof data.skills === 'object') {
      return { version: 1, skills: data.skills as Record<string, SkillMetaEntry> };
    }
    return emptyMetadata();
  } catch {
    return emptyMetadata();
  }
}

export async function saveMetadata(meta: SyncMetadata, file: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
  await rename(tmp, file);
}

export function compareSkills(
  remote: Record<string, string>,
  skills: Record<string, SkillMetaEntry>
): SkillDiff {
  const result: SkillDiff = { new: [], same: [], changed: [], conflict: [] };
  for (const name of Object.keys(remote).sort()) {
    const sha = remote[name];
    const entry = skills[name];
    if (entry === undefined) {
      result.new.push([name, sha]);
    } else if (entry.conflicts !== undefined) {
      result.conflict.push([name, sha]);
    } else if (entry.sha256 === sha) {
      result.same.push([name, sha]);
    } else {
      result.changed.push([name, sha]);
    }
  }
  return result;
}

export function renderManifest(meta: SyncMetadata): string {
  const skills = meta.skills;
  const conflicts = Object.values(skills).filter((e) => e.conflicts !== undefined).length;
  const lines = [
    '# Skill Manifest',
    `生成时间: ${nowIso()}`,
    `技能总数: ${Object.keys(skills).length} | 冲突: ${conflicts}`,
    '',
    '| 技能 | 校验和(8位) | 来源 | 冲突 |',
    '|---|---|---|---|',
  ];
  for (const name of Object.keys(skills).sort()) {
    const entry = skills[name];
    lines.push(
      `| ${name} | ${(entry.sha256 || '?').slice(0, 8)} | ${entry.sources.join(',') || '-'} | ${Object.keys(entry.conflicts ?? {}).join(',') || '-'} |`
    );
  }
  return lines.join('\n') + '\n';
}
