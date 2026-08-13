import fs from 'node:fs';
import path from 'node:path';
import type { Registry } from './registry';
import { getRegistryDir, slugify } from './registry';
import { isManagedLink } from './adapters';

export function getSkillsDir(): string {
  return path.join(getRegistryDir(), 'skills');
}

export type SyncResult = {
  skillId: string;
  platform: string;
  status: 'synced' | 'skipped' | 'failed' | 'conflict' | 'removed';
  detail: string;
};

type SyncOpts = { dryRun?: boolean; platform?: string; skillId?: string };

/** 目标存在判断：lstat 不跟随链接，悬空 symlink 也视为存在（交由 relink/doctor 处理） */
function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

export function syncSkills(reg: Registry, opts: SyncOpts = {}): SyncResult[] {
  const results: SyncResult[] = [];
  const skillsDir = getSkillsDir();
  const platforms = reg
    .listPlatforms()
    .filter((p) => p.enabled === 1 && (!opts.platform || p.name === opts.platform));

  const skills = reg.listSkills().filter((s) => !opts.skillId || s.id === opts.skillId);

  for (const skill of skills) {
    const canonical = path.join(skillsDir, skill.id);
    if (!fs.existsSync(canonical)) continue;

    for (const platform of platforms) {
      const target = path.join(platform.install_dir, skill.id);
      const exists = pathExists(target);

      if (opts.dryRun) {
        const state = reg.getSyncState(skill.id, platform.name);
        if (state?.status === 'linked' && exists && isManagedLink(target, canonical)) {
          results.push({ skillId: skill.id, platform: platform.name, status: 'skipped', detail: 'Already linked' });
        } else {
          results.push({ skillId: skill.id, platform: platform.name, status: 'synced', detail: '[dry-run] Would create link' });
        }
        continue;
      }

      if (exists) {
        if (isManagedLink(target, canonical)) {
          reg.setSyncState(skill.id, platform.name, 'linked');
          results.push({ skillId: skill.id, platform: platform.name, status: 'skipped', detail: 'Already linked' });
        } else if (fs.lstatSync(target).isSymbolicLink()) {
          // 指向别处的链接——移除后重建
          try {
            fs.unlinkSync(target);
            fs.symlinkSync(canonical, target, 'dir');
            reg.setSyncState(skill.id, platform.name, 'linked');
            results.push({ skillId: skill.id, platform: platform.name, status: 'synced', detail: 'Relinked' });
          } catch (e) {
            reg.setSyncState(skill.id, platform.name, 'conflict', String(e));
            results.push({ skillId: skill.id, platform: platform.name, status: 'conflict', detail: String(e) });
          }
        } else {
          // 真实目录——冲突，绝不覆盖
          reg.setSyncState(skill.id, platform.name, 'conflict', 'Real directory exists');
          results.push({
            skillId: skill.id,
            platform: platform.name,
            status: 'conflict',
            detail: 'Real directory exists, not overwriting',
          });
        }
      } else {
        try {
          fs.mkdirSync(platform.install_dir, { recursive: true });
          fs.symlinkSync(canonical, target, 'dir');
          reg.setSyncState(skill.id, platform.name, 'linked');
          results.push({ skillId: skill.id, platform: platform.name, status: 'synced', detail: `Linked -> ${canonical}` });
        } catch (e) {
          reg.setSyncState(skill.id, platform.name, 'failed', String(e));
          results.push({ skillId: skill.id, platform: platform.name, status: 'failed', detail: String(e) });
        }
      }
    }
  }
  return results;
}

export function removeSkillFromPlatform(reg: Registry, skillId: string, platform: string): SyncResult {
  const platformRow = reg.listPlatforms().find((p) => p.name === platform);
  if (!platformRow) return { skillId, platform, status: 'failed', detail: 'Platform not registered' };
  const target = path.join(platformRow.install_dir, skillId);

  const exists = pathExists(target);
  if (!exists) return { skillId, platform, status: 'skipped', detail: 'Not installed' };

  if (!fs.lstatSync(target).isSymbolicLink()) {
    return { skillId, platform, status: 'failed', detail: 'Real directory — refusing to remove' };
  }

  try {
    fs.unlinkSync(target);
    reg.setSyncState(skillId, platform, 'removed');
    return { skillId, platform, status: 'removed', detail: 'Link removed' };
  } catch (e) {
    reg.setSyncState(skillId, platform, 'failed', String(e));
    return { skillId, platform, status: 'failed', detail: String(e) };
  }
}

export function importSkill(reg: Registry, opts: { name: string; sourcePath: string }): { id: string } {
  const base = slugify(opts.name) || 'skill';
  // 同名已存在 -> 幂等复用其 canonical 目录；slug 被其他技能/残留目录占用 -> 消歧后缀
  const sameName = reg.listSkills().find((s) => s.name === opts.name);
  let id = sameName ? sameName.id : base;
  if (!sameName) {
    let n = 2;
    while (reg.listSkills().some((s) => s.id === id) || pathExists(path.join(getSkillsDir(), id))) {
      id = base + '-' + n++;
    }
  }
  const dest = path.join(getSkillsDir(), id);
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(opts.sourcePath, dest, { recursive: true });
  reg.addSkill({ name: opts.name, description: '', source_dir: dest });
  return { id };
}
