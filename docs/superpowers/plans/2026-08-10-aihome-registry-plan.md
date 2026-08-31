# AIHome Skill Registry (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 设计文档：`docs/superpowers/specs/2026-08-10-aihome-desktop-design.md`（§4 P1）
> 参考实现（翻译源）：`~/Documents/05-项目代码/skillhub/src/skillhub/`（Python：registry.py / syncer.py / adapters/* / utils/symlinks.py）

**Goal:** 把 skillhub（symlink 技能注册表）TS 化进 AIHome，与现有 git 四端同步（`src/lib/sync/`）并存：规范副本 + SQLite 注册表 + 三平台 symlink 分发 + doctor 健康检查。

**Architecture:** `node:sqlite` 的 `DatabaseSync`（沿用 `src/lib/usage/cache.ts` 用法）存注册表（`~/.aihome/registry.db`，e2e 用 `AIHOME_REGISTRY_DIR` env 覆盖）；平台适配器纯函数检测；同步引擎在服务端用 Node `fs.symlink/readlink/unlink` 操作，冲突保护（真实目录绝不覆盖）；API 路由暴露给 UI。symlink 走 Node fs 而非 Rust command（spec 修正：web/桌面同一代码路径）。

**Tech Stack:** TypeScript、`node:sqlite`、Vitest、Playwright、Next.js App Router。

## Global Constraints

- 注册表根：`getRegistryDir()` = `AIHOME_REGISTRY_DIR` env ?? `~/.aihome`；技能规范副本在 `<root>/skills/<id>/`
- SQLite schema v1：`skills` / `platforms` / `sync_links` 三表 + `PRAGMA user_version = 1`
- 冲突保护硬规则：目标路径已存在且非注册表管理的 symlink → `conflict`，**绝不覆盖**（含删除操作：真实目录拒绝删除）
- 测试**绝不触碰**真实 `~/.claude` / `~/.codex` / `~/.workbuddy`（全部 tmp fixture，`isInstalled` 通过注入的检测函数测试）
- 平台名：`claude-code` / `codex` / `workbuddy`；适配器路径 `~/.claude/skills` / `~/.codex/skills` / `~/.workbuddy/skills`，`isInstalled` = 父目录（`~/.claude` 等）存在
- 现有 115 单测 / 110 e2e 保持全绿；e2e 用 `PORT=3100`
- 提交风格：`feat(registry): ...`

---

### Task 1: registry.ts — SQLite 注册表（CRUD + sync 状态 + 迁移）

**Files:**
- Create: `src/lib/registry/types.ts`
- Create: `src/lib/registry/registry.ts`
- Create: `src/lib/registry/registry.test.ts`

**Interfaces:**
- Consumes: 无（独立）
- Produces:
  - `getRegistryDir(): string`
  - `class Registry`：`open()` / `close()` / `version()` / `migrate()` / `addSkill(skill: NewSkill): string` / `listSkills(): SkillRow[]` / `deleteSkill(id: string): void` / `setSyncState(skillId, platform, status: SyncStatus, error?)` / `getSyncState(skillId, platform): SyncStateRow | null` / `listPlatforms(): PlatformRow[]` / `registerPlatform(name, installDir)` / `setPlatformEnabled(name, enabled: boolean)`
  - `type SkillRow = { id, name, description, source_dir, installed_at }`；`type PlatformRow = { name, enabled: 0|1, install_dir }`；`type SyncStatus = 'linked'|'broken'|'conflict'|'removed'`；`type SyncStateRow = { skill_id, platform, status, error, linked_at }`；`type NewSkill = { name, description, source_dir }`

- [x] **Step 1: 写失败测试**

```typescript
// src/lib/registry/registry.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Registry } from './registry';

let dir: string;
let reg: Registry;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'aihome-reg-'));
  process.env.AIHOME_REGISTRY_DIR = dir;
  reg = new Registry();
  reg.open();
});

afterEach(() => {
  reg.close();
  delete process.env.AIHOME_REGISTRY_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('Registry', () => {
  it('creates schema on first open (user_version=1)', () => {
    expect(reg.version()).toBe(1);
  });

  it('adds and lists skills', () => {
    const id = reg.addSkill({ name: 'doc-writer', description: 'writes docs', source_dir: path.join(dir, 'skills', 'doc-writer') });
    expect(id).toBe('doc-writer');
    const skills = reg.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('doc-writer');
  });

  it('tracks sync state per skill+platform', () => {
    const id = reg.addSkill({ name: 'a', description: '', source_dir: path.join(dir, 'skills', 'a') });
    reg.setSyncState(id, 'claude-code', 'linked');
    expect(reg.getSyncState(id, 'claude-code')?.status).toBe('linked');
    expect(reg.getSyncState(id, 'codex')).toBeNull();
  });

  it('registers and enables platforms', () => {
    reg.registerPlatform('codex', '/tmp/codex-skills');
    reg.setPlatformEnabled('codex', true);
    expect(reg.listPlatforms().find((p) => p.name === 'codex')?.enabled).toBe(1);
  });

  it('deletes skills and cascades sync state', () => {
    const id = reg.addSkill({ name: 'a', description: '', source_dir: path.join(dir, 'skills', 'a') });
    reg.setSyncState(id, 'claude-code', 'linked');
    reg.deleteSkill(id);
    expect(reg.listSkills()).toHaveLength(0);
    expect(reg.getSyncState(id, 'claude-code')).toBeNull();
  });

  it('reopens existing db without migration errors', () => {
    reg.close();
    reg.open();
    expect(reg.version()).toBe(1);
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/registry/registry.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: 实现 types.ts**

```typescript
// src/lib/registry/types.ts
export type SkillRow = {
  id: string;
  name: string;
  description: string;
  source_dir: string;
  installed_at: string;
};

export type PlatformRow = {
  name: string;
  enabled: number; // 0 | 1
  install_dir: string;
};

export type SyncStatus = 'linked' | 'broken' | 'conflict' | 'removed';

export type SyncStateRow = {
  skill_id: string;
  platform: string;
  status: SyncStatus;
  error: string;
  linked_at: string;
};

export type NewSkill = {
  name: string;
  description: string;
  source_dir: string;
};
```

- [x] **Step 4: 实现 registry.ts**

```typescript
// src/lib/registry/registry.ts
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { NewSkill, PlatformRow, SkillRow, SyncStateRow, SyncStatus } from './types';

export function getRegistryDir(): string {
  return process.env.AIHOME_REGISTRY_DIR ?? path.join(os.homedir(), '.aihome');
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class Registry {
  private db: DatabaseSync | null = null;

  open(): void {
    const dir = getRegistryDir();
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(path.join(dir, 'registry.db'));
    this.migrate();
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  version(): number {
    const row = this.db!.prepare('PRAGMA user_version').get() as { user_version: number };
    return row.user_version;
  }

  migrate(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        source_dir TEXT NOT NULL,
        installed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS platforms (
        name TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        install_dir TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_links (
        skill_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT NOT NULL DEFAULT '',
        linked_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (skill_id, platform)
      );
    `);
    if (this.version() < 1) {
      this.db!.exec('PRAGMA user_version = 1');
    }
  }

  addSkill(skill: NewSkill): string {
    const id = slugify(skill.name) || 'skill';
    this.db!.prepare(
      'INSERT OR REPLACE INTO skills (id, name, description, source_dir) VALUES (?, ?, ?, ?)'
    ).run(id, skill.name, skill.description, skill.source_dir);
    return id;
  }

  listSkills(): SkillRow[] {
    return this.db!.prepare('SELECT * FROM skills ORDER BY name').all() as unknown as SkillRow[];
  }

  deleteSkill(id: string): void {
    this.db!.prepare('DELETE FROM sync_links WHERE skill_id = ?').run(id);
    this.db!.prepare('DELETE FROM skills WHERE id = ?').run(id);
  }

  setSyncState(skillId: string, platform: string, status: SyncStatus, error = ''): void {
    this.db!
      .prepare(
        `INSERT OR REPLACE INTO sync_links (skill_id, platform, status, error, linked_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run(skillId, platform, status, error);
  }

  getSyncState(skillId: string, platform: string): SyncStateRow | null {
    const row = this.db!
      .prepare('SELECT * FROM sync_links WHERE skill_id = ? AND platform = ?')
      .get(skillId, platform) as SyncStateRow | undefined;
    return row ?? null;
  }

  listPlatforms(): PlatformRow[] {
    return this.db!.prepare('SELECT * FROM platforms ORDER BY name').all() as unknown as PlatformRow[];
  }

  registerPlatform(name: string, installDir: string): void {
    this.db!
      .prepare('INSERT OR IGNORE INTO platforms (name, enabled, install_dir) VALUES (?, 0, ?)')
      .run(name, installDir);
  }

  setPlatformEnabled(name: string, enabled: boolean): void {
    this.db!.prepare('UPDATE platforms SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);
  }
}
```

- [x] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/lib/registry/registry.test.ts`
Expected: 6 passed

- [x] **Step 6: 回归**

Run: `npm test`
Expected: 全绿（115 + 6 = 121）

- [x] **Step 7: Commit**

```bash
git add src/lib/registry/types.ts src/lib/registry/registry.ts src/lib/registry/registry.test.ts
git commit -m "feat(registry): sqlite registry with CRUD + sync state (schema v1)"
```

---

### Task 2: adapters.ts — 平台适配器与链接归属检测

**Files:**
- Create: `src/lib/registry/adapters.ts`
- Create: `src/lib/registry/adapters.test.ts`

**Interfaces:**
- Consumes: `Registry`（Task 1，`registerPlatform` 用）
- Produces:
  - `type PlatformAdapter = { name: string; displayName: string; skillDir: string; isInstalled: () => boolean }`
  - `BUILTIN_ADAPTERS: PlatformAdapter[]`（三平台，home 用 `os.homedir()` 运行时求值）
  - `detectInstalled(): PlatformAdapter[]`
  - `ensurePlatformsRegistered(reg: Registry): void`
  - `isManagedLink(targetPath: string, canonicalDir: string): boolean`（lstat 是 symlink 且 realpath 等于 canonical realpath）
  - `type PlatformLink = { name: string; skillDir: string }`（供测试注入 fake 平台目录）

- [x] **Step 1: 写失败测试**

```typescript
// src/lib/registry/adapters.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BUILTIN_ADAPTERS, isManagedLink } from './adapters';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'aihome-adapter-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('BUILTIN_ADAPTERS', () => {
  it('has three platforms with expected skill dirs', () => {
    const names = BUILTIN_ADAPTERS.map((a) => a.name).sort();
    expect(names).toEqual(['claude-code', 'codex', 'workbuddy']);
    expect(BUILTIN_ADAPTERS.find((a) => a.name === 'claude-code')?.skillDir).toContain('.claude');
    expect(BUILTIN_ADAPTERS.find((a) => a.name === 'codex')?.skillDir).toContain('.codex');
    expect(BUILTIN_ADAPTERS.find((a) => a.name === 'workbuddy')?.skillDir).toContain('.workbuddy');
  });
});

describe('isManagedLink', () => {
  it('recognizes symlink pointing to canonical dir', () => {
    const canonical = path.join(dir, 'canonical');
    const platform = path.join(dir, 'platform');
    mkdirSync(canonical);
    mkdirSync(platform);
    const link = path.join(platform, 'skill-a');
    symlinkSync(canonical, link, 'dir');
    expect(isManagedLink(link, canonical)).toBe(true);
  });

  it('returns false for real directory', () => {
    const canonical = path.join(dir, 'canonical');
    mkdirSync(canonical);
    const real = path.join(dir, 'platform', 'skill-b');
    mkdirSync(real, { recursive: true });
    expect(isManagedLink(real, canonical)).toBe(false);
  });

  it('returns false for symlink pointing elsewhere', () => {
    const canonical = path.join(dir, 'canonical');
    const other = path.join(dir, 'other');
    const platform = path.join(dir, 'platform');
    mkdirSync(canonical);
    mkdirSync(other);
    mkdirSync(platform);
    const link = path.join(platform, 'skill-c');
    symlinkSync(other, link, 'dir');
    expect(isManagedLink(link, canonical)).toBe(false);
  });

  it('returns false for nonexistent path', () => {
    expect(isManagedLink(path.join(dir, 'nope'), path.join(dir, 'canonical'))).toBe(false);
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/registry/adapters.test.ts`
Expected: FAIL

- [x] **Step 3: 实现 adapters.ts**

```typescript
// src/lib/registry/adapters.ts
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Registry } from './registry';

export type PlatformAdapter = {
  name: string;
  displayName: string;
  skillDir: string;
  isInstalled: () => boolean;
};

export const BUILTIN_ADAPTERS: PlatformAdapter[] = [
  {
    name: 'claude-code',
    displayName: 'Claude Code',
    skillDir: path.join(os.homedir(), '.claude', 'skills'),
    isInstalled: () => fs.existsSync(path.join(os.homedir(), '.claude')),
  },
  {
    name: 'codex',
    displayName: 'OpenAI Codex',
    skillDir: path.join(os.homedir(), '.codex', 'skills'),
    isInstalled: () => fs.existsSync(path.join(os.homedir(), '.codex')),
  },
  {
    name: 'workbuddy',
    displayName: 'WorkBuddy',
    skillDir: path.join(os.homedir(), '.workbuddy', 'skills'),
    isInstalled: () => fs.existsSync(path.join(os.homedir(), '.workbuddy')),
  },
];

export function detectInstalled(): PlatformAdapter[] {
  return BUILTIN_ADAPTERS.filter((a) => a.isInstalled());
}

export function ensurePlatformsRegistered(reg: Registry): void {
  for (const adapter of detectInstalled()) {
    reg.registerPlatform(adapter.name, adapter.skillDir);
  }
}

export function isManagedLink(targetPath: string, canonicalDir: string): boolean {
  try {
    const stat = fs.lstatSync(targetPath);
    if (!stat.isSymbolicLink()) return false;
    const resolved = fs.realpathSync(targetPath);
    const canonical = fs.realpathSync(canonicalDir);
    return resolved === canonical;
  } catch {
    return false;
  }
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/registry/adapters.test.ts`
Expected: 7 passed

- [x] **Step 5: Commit**

```bash
git add src/lib/registry/adapters.ts src/lib/registry/adapters.test.ts
git commit -m "feat(registry): platform adapters (claude-code/codex/workbuddy) + link ownership check"
```
