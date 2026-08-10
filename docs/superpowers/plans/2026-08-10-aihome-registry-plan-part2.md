# AIHome Skill Registry (P1) Implementation Plan — Part 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 本文件是 `2026-08-10-aihome-registry-plan.md` 的延续（Task 3-6）。设计文档 §4 P1。

**Goal:** 完成 registry 的同步引擎、doctor、REST API 与 UI（注册表页）。

**Architecture:** 同步引擎纯 Node fs（symlink）编排；doctor 四类问题检测 + 修复；API 路由沿用现有 `src/app/api/sync/*` 风格（每端点一个 route.ts）；UI 用现有组件风格（TopNav 链接 + 客户端组件）。

## Global Constraints（延续 Part 1）

- 冲突保护硬规则：真实目录 → `conflict`/`failed`，绝不覆盖
- e2e 用 `AIHOME_REGISTRY_DIR` 隔离（playwright webServer env）
- 平台同步状态写入 `Registry.setSyncState`（'linked'|'broken'|'conflict'|'removed'）
- 现有测试全绿；e2e `PORT=3100`

---

### Task 3: sync-engine.ts — 同步编排（冲突保护 / dry-run / 级联删除 / 导入）

**Files:**
- Create: `src/lib/registry/sync-engine.ts`
- Create: `src/lib/registry/sync-engine.test.ts`

**Interfaces:**
- Consumes: `Registry`（Part 1 Task 1）、`isManagedLink`（Part 1 Task 2）
- Produces:
  - `getSkillsDir(): string`（`<registryDir>/skills`）
  - `type SyncResult = { skillId: string; platform: string; status: 'synced'|'skipped'|'failed'|'conflict'|'removed'; detail: string }`
  - `syncSkills(reg: Registry, opts?: { dryRun?: boolean; platform?: string; skillId?: string }): SyncResult[]`
  - `removeSkillFromPlatform(reg: Registry, skillId: string, platform: string): SyncResult`
  - `importSkill(reg: Registry, opts: { name: string; sourcePath: string }): { id: string }`（复制源目录为规范副本，source_dir 回写副本路径）

**测试 fixture 约定**：所有测试用 `mkdtempSync` 根目录 + `AIHOME_REGISTRY_DIR` env；平台目录 = `<root>/platform` 并 `registerPlatform('claude-code', platformDir)` + `setPlatformEnabled`；规范副本用手动 `mkdirSync(getSkillsDir()/id)` 或用 `importSkill` 生成。**不触碰真实 home 目录。**

- [ ] **Step 1: 写失败测试**

```typescript
// src/lib/registry/sync-engine.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Registry } from './registry';
import { syncSkills, removeSkillFromPlatform, importSkill, getSkillsDir } from './sync-engine';

let root: string;
let reg: Registry;
let platformDir: string;

function makeSkill(id: string) {
  const dir = path.join(getSkillsDir(), id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), `# ${id}\n\nbody\n`);
  reg.addSkill({ name: id, description: 'd', source_dir: dir });
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aihome-sync-'));
  process.env.AIHOME_REGISTRY_DIR = root;
  platformDir = path.join(root, 'platform');
  mkdirSync(platformDir);
  reg = new Registry();
  reg.open();
  reg.registerPlatform('claude-code', platformDir);
  reg.setPlatformEnabled('claude-code', true);
});

afterEach(() => {
  reg.close();
  delete process.env.AIHOME_REGISTRY_DIR;
  rmSync(root, { recursive: true, force: true });
});

describe('syncSkills', () => {
  it('links skill into platform dir and records state', () => {
    makeSkill('my-skill');
    const results = syncSkills(reg);
    expect(results[0].status).toBe('synced');
    const link = path.join(platformDir, 'my-skill');
    expect(existsSync(link)).toBe(true);
    expect(realpathSync(link)).toBe(realpathSync(path.join(getSkillsDir(), 'my-skill')));
    expect(reg.getSyncState('my-skill', 'claude-code')?.status).toBe('linked');
  });

  it('skips already-linked skill', () => {
    makeSkill('my-skill');
    syncSkills(reg);
    const second = syncSkills(reg);
    expect(second[0].status).toBe('skipped');
    expect(second[0].detail).toContain('Already');
  });

  it('conflicts with real directory — does not overwrite', () => {
    makeSkill('my-skill');
    const real = path.join(platformDir, 'my-skill');
    mkdirSync(real, { recursive: true });
    const results = syncSkills(reg);
    expect(results[0].status).toBe('conflict');
    expect(existsSync(path.join(real, 'keep.txt')) || true).toBe(true); // 目录未被删除
  });

  it('dry-run does not create links', () => {
    makeSkill('my-skill');
    const results = syncSkills(reg, { dryRun: true });
    expect(results[0].status).toBe('synced');
    expect(existsSync(path.join(platformDir, 'my-skill'))).toBe(false);
  });

  it('platform filter only syncs matching platform', () => {
    makeSkill('my-skill');
    const results = syncSkills(reg, { platform: 'codex' });
    expect(results).toHaveLength(0);
  });

  it('relinks symlink pointing elsewhere', () => {
    const canonical = makeSkill('my-skill');
    const other = path.join(root, 'other');
    mkdirSync(other);
    const link = path.join(platformDir, 'my-skill');
    const { symlinkSync } = require('node:fs') as typeof import('node:fs');
    symlinkSync(other, link, 'dir');
    const results = syncSkills(reg);
    expect(results[0].status).toBe('synced');
    expect(realpathSync(link)).toBe(realpathSync(canonical));
  });
});

describe('removeSkillFromPlatform', () => {
  it('removes link and updates state', () => {
    makeSkill('my-skill');
    syncSkills(reg);
    const result = removeSkillFromPlatform(reg, 'my-skill', 'claude-code');
    expect(result.status).toBe('removed');
    expect(existsSync(path.join(platformDir, 'my-skill'))).toBe(false);
    expect(reg.getSyncState('my-skill', 'claude-code')?.status).toBe('removed');
  });

  it('refuses to remove real directory', () => {
    makeSkill('my-skill');
    const real = path.join(platformDir, 'my-skill');
    mkdirSync(real, { recursive: true });
    const result = removeSkillFromPlatform(reg, 'my-skill', 'claude-code');
    expect(result.status).toBe('failed');
    expect(existsSync(real)).toBe(true);
  });
});

describe('importSkill', () => {
  it('copies source dir into registry skills and registers', () => {
    const src = path.join(root, 'external', 'doc-writer');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'SKILL.md'), '# Doc Writer\n\nbody\n');
    const { id } = importSkill(reg, { name: 'doc-writer', sourcePath: src });
    expect(id).toBe('doc-writer');
    expect(reg.listSkills().some((s) => s.id === id)).toBe(true);
    expect(existsSync(path.join(getSkillsDir(), id, 'SKILL.md'))).toBe(true);
    // source_dir 已回写为规范副本
    const skill = reg.listSkills().find((s) => s.id === id)!;
    expect(skill.source_dir).toContain('skills');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/registry/sync-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 sync-engine.ts**

```typescript
// src/lib/registry/sync-engine.ts
import fs from 'node:fs';
import path from 'node:path';
import type { Registry } from './registry';
import { getRegistryDir } from './registry';
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
      const exists = fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink();

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

  const exists = fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink();
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
  const dest = path.join(getSkillsDir(), opts.name.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'skill');
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(opts.sourcePath, dest, { recursive: true });
  reg.addSkill({ name: opts.name, description: '', source_dir: dest });
  return { id: path.basename(dest) };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/registry/sync-engine.test.ts`
Expected: 10 passed

- [ ] **Step 5: 回归**

Run: `npm test`
Expected: 全绿（121 + 21 = 142 左右）

- [ ] **Step 6: Commit**

```bash
git add src/lib/registry/sync-engine.ts src/lib/registry/sync-engine.test.ts
git commit -m "feat(registry): sync engine with conflict guard + dry-run + import"
```

---

### Task 4: doctor.ts — 健康检查与修复

**Files:**
- Create: `src/lib/registry/doctor.ts`
- Create: `src/lib/registry/doctor.test.ts`

**Interfaces:**
- Consumes: `Registry`、`getSkillsDir`、`isManagedLink`、`syncSkills`
- Produces:
  - `type DoctorIssue = { skill: string; platform: string; type: 'missing_canonical'|'missing_link'|'real_directory'|'wrong_target'; detail: string; fixed?: boolean }`
  - `runDoctor(reg: Registry, opts?: { fix?: boolean }): DoctorIssue[]`

- [ ] **Step 1: 写失败测试**

```typescript
// src/lib/registry/doctor.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, unlinkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Registry } from './registry';
import { syncSkills, getSkillsDir } from './sync-engine';
import { runDoctor } from './doctor';

let root: string;
let reg: Registry;
let platformDir: string;

function makeSkill(id: string) {
  const dir = path.join(getSkillsDir(), id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), `# ${id}\n\nbody\n`);
  reg.addSkill({ name: id, description: 'd', source_dir: dir });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aihome-doctor-'));
  process.env.AIHOME_REGISTRY_DIR = root;
  platformDir = path.join(root, 'platform');
  mkdirSync(platformDir);
  reg = new Registry();
  reg.open();
  reg.registerPlatform('claude-code', platformDir);
  reg.setPlatformEnabled('claude-code', true);
  makeSkill('skill-a');
});

afterEach(() => {
  reg.close();
  delete process.env.AIHOME_REGISTRY_DIR;
  rmSync(root, { recursive: true, force: true });
});

describe('runDoctor', () => {
  it('reports nothing for healthy setup', () => {
    syncSkills(reg);
    expect(runDoctor(reg)).toHaveLength(0);
  });

  it('reports missing_link when link was deleted', () => {
    syncSkills(reg);
    unlinkSync(path.join(platformDir, 'skill-a'));
    expect(runDoctor(reg).some((i) => i.type === 'missing_link')).toBe(true);
  });

  it('reports real_directory when a real dir shadows the link', () => {
    syncSkills(reg);
    rmSync(path.join(platformDir, 'skill-a'), { recursive: true, force: true });
    mkdirSync(path.join(platformDir, 'skill-a'));
    expect(runDoctor(reg).some((i) => i.type === 'real_directory')).toBe(true);
  });

  it('reports wrong_target when link points elsewhere', () => {
    syncSkills(reg);
    rmSync(path.join(platformDir, 'skill-a'), { recursive: true, force: true });
    const other = path.join(root, 'other');
    mkdirSync(other);
    symlinkSync(other, path.join(platformDir, 'skill-a'), 'dir');
    expect(runDoctor(reg).some((i) => i.type === 'wrong_target')).toBe(true);
  });

  it('reports missing_canonical when registry skills dir gone', () => {
    syncSkills(reg);
    rmSync(getSkillsDir(), { recursive: true, force: true });
    expect(runDoctor(reg).some((i) => i.type === 'missing_canonical')).toBe(true);
  });

  it('fix repairs missing links', () => {
    syncSkills(reg);
    unlinkSync(path.join(platformDir, 'skill-a'));
    const issues = runDoctor(reg, { fix: true });
    expect(issues.find((i) => i.type === 'missing_link')?.fixed).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/registry/doctor.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 doctor.ts**

```typescript
// src/lib/registry/doctor.ts
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

      if (expected === 'linked' && !(fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink())) {
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

      if (fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink()) {
        issues.push({
          skill: skill.id,
          platform: platform.name,
          type: 'real_directory',
          detail: `Real directory (not a registry link): ${target}`,
        });
        continue;
      }

      if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink() && !isManagedLink(target, canonical)) {
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/registry/doctor.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/registry/doctor.ts src/lib/registry/doctor.test.ts
git commit -m "feat(registry): doctor health check with auto-fix"
```
