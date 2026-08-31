import fs from 'node:fs';
import path from 'node:path';
import type { Registry } from './registry';
import { isManagedLink } from './adapters';
import { getSkillsDir, syncSkills } from './sync-engine';

export type DoctorIssue = {
  skill: string;
  platform: string;
  type: 'missing_canonical' | 'missing_link' | 'real_directory' | 'wrong_target';
  detail: string;
  fixed?: boolean;
};

/** 目标存在判断：lstat 不跟随链接，悬空 symlink 也视为存在 */
function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

export function runDoctor(reg: Registry, opts: { fix?: boolean } = {}): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  const skillsDir = getSkillsDir();
  const platforms = reg.listPlatforms().filter((p) => p.enabled === 1);

  for (const skill of reg.listSkills()) {
    const canonical = path.join(skillsDir, skill.id);
    if (!fs.existsSync(canonical)) {
      issues.push({
        skill: skill.id,
        platform: 'registry',
        type: 'missing_canonical',
        detail: `Canonical skill directory missing: ${canonical}`,
      });
      continue;
    }

    for (const platform of platforms) {
      const target = path.join(platform.install_dir, skill.id);
      const state = reg.getSyncState(skill.id, platform.name);
      const expected = state?.status;

      if (expected === 'linked' && !pathExists(target)) {
        const issue: DoctorIssue = {
          skill: skill.id,
          platform: platform.name,
          type: 'missing_link',
          detail: `Expected link not found: ${target}`,
        };
        if (opts.fix) {
          const results = syncSkills(reg, { platform: platform.name, skillId: skill.id });
          issue.fixed = results.some((r) => r.status === 'synced' || r.status === 'skipped');
        }
        issues.push(issue);
        continue;
      }

      if (pathExists(target) && !fs.lstatSync(target).isSymbolicLink()) {
        issues.push({
          skill: skill.id,
          platform: platform.name,
          type: 'real_directory',
          detail: `Real directory (not a registry link): ${target}`,
        });
        continue;
      }

      if (pathExists(target) && fs.lstatSync(target).isSymbolicLink() && !isManagedLink(target, canonical)) {
        const issue: DoctorIssue = {
          skill: skill.id,
          platform: platform.name,
          type: 'wrong_target',
          detail: `Link points elsewhere: ${target}`,
        };
        if (opts.fix) {
          try {
            fs.unlinkSync(target);
            const results = syncSkills(reg, { platform: platform.name, skillId: skill.id });
            issue.fixed = results.some((r) => r.status === 'synced');
          } catch {
            issue.fixed = false;
          }
        }
        issues.push(issue);
      }
    }
  }
  return issues;
}
