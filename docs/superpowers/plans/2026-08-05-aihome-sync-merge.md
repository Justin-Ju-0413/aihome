# AIHome × skill-sync 合并（M1: 同步核心并入）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 skill-sync 的跨端技能同步能力（collect/push/冲突/幂等/迁移）用 TypeScript 重写并并入 AIHome，提供同步页与 API，冻结 skill-sync 仓库。

**Architecture:** `src/lib/sync/` 六个纯 TS 模块（paths/config/checksum/metadata/git/engine + migration），全部路径经环境变量注入（`AIHOME_REPO_DIR`/`AIHOME_CONFIG_DIR`，测试与 e2e 用临时目录隔离）；`/api/sync/*` 五个路由暴露引擎；同步页与设置页端点区块为 UI；行为与 Python 版逐条对齐（校验和/冲突保留策略/幂等/无删除传播）。

**Tech Stack:** Next.js 16（App Router）/ TypeScript strict / vitest（新增 devDependency，唯一新增）/ node:fs/promises / node:child_process（git）/ Playwright e2e。

## Global Constraints

- 技术栈：仅新增 `vitest` 一个 devDependency；同步核心零运行时依赖
- 路径注入：`AIHOME_REPO_DIR`（默认 `~/.aihome/repo`）、`AIHOME_CONFIG_DIR`（默认 `~/.aihome`），所有路径用函数在运行时解析，禁止模块级常量捕获
- 行为对齐（逐条移植自 sync.py）：技能判定 = 目录含 `SKILL.md` 且非隐藏非 `.zip`；冲突 = 同名不同内容 → 保留 `name` 与 `name@端` 两份；幂等 = 校验和相同跳过；push 覆盖端上分歧版本但不推送冲突标记技能；无删除传播
- metadata.json 格式：`{"version": 1, "skills": {name: {sha256, sources[], updated_at, conflicts?: {端: sha}}}}`
- 校验和：目录内所有文件按相对路径排序级联 `relpath + "\x00" + content` 的 SHA-256，跳过隐藏项
- 端配置：`sync-config.json` 存 `{"version": 1, "endpoints": {name: path}}` 全量 map；空/缺失回退默认四端（opencode/claude/codex/hermes）；端名 `^[a-z0-9][a-z0-9_-]{0,63}$`（大小写不敏感，含 /i）
- 写操作全部支持 `dryRun`；git 失败返回结构化错误码 `GIT_MISSING`/`GIT_CONFLICT`/`GIT_PERMISSION`/`GIT_OTHER`
- 迁移：检测旧 `~/skill-sync`（存在 `common/` 与 `metadata.json`）→ 复制到 `~/.aihome/repo`（原目录不动、幂等）；AIHome 的 `.aihome/`（项目工作区）与 `~/.aihome`（用户级同步）互不干扰
- 现有 91 个 e2e 必须保持全绿；`lint`/`tsc --noEmit`/`build` 干净

---

### Task 1: vitest 测试基础设施

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/sync/__tests__/smoke.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: 无
- Produces: `npm run test`（= `vitest run`）；vitest 配置含 `@` → `./src` 别名、仅跑 `src/lib/sync/**/*.test.ts`

- [ ] **Step 1: 安装 vitest**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm install -D vitest`
Expected: 安装成功（package.json devDependencies 出现 `vitest`）

- [ ] **Step 2: 写冒烟测试**

Create `src/lib/sync/__tests__/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('sync test infra', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: 写 vitest 配置**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/sync/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 4: 加 npm script**

Modify `package.json` scripts 增加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: `Test Files  1 passed`，`1 passed`

- [ ] **Step 6: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add vitest.config.ts src/lib/sync/__tests__/smoke.test.ts package.json package-lock.json && git commit -m "test: 接入 vitest 单元测试基础设施"
```

---

### Task 2: paths 与 config 模块

**Files:**
- Create: `src/lib/sync/paths.ts`
- Create: `src/lib/sync/config.ts`
- Create: `src/lib/sync/__tests__/config.test.ts`

**Interfaces:**
- Consumes: 无
- Produces（后续任务全部依赖）:
  - `paths.ts`:
    - `configDir(): string` — `AIHOME_CONFIG_DIR` ?? `~/.aihome`
    - `repoDir(): string` — `AIHOME_REPO_DIR` ?? `~/.aihome/repo`
    - `commonDir(): string` — `path.join(repoDir(), 'common')`
    - `metadataFile(): string` — `path.join(repoDir(), 'metadata.json')`
  - `config.ts`:
    - `DEFAULT_ENDPOINTS: Record<string, string>` — 四端默认路径（`~/.config/opencode/skills`、`~/.claude/skills`、`~/.codex/skills`、`~/.hermes/skills`）
    - `syncConfigPath(): string` — `path.join(configDir(), 'sync-config.json')`
    - `interface SyncConfig { version: 1; endpoints: Record<string, string> }`
    - `loadSyncConfig(): Promise<SyncConfig>` — 缺失/损坏回退 `{version: 1, endpoints: {}}`
    - `saveSyncConfig(config: SyncConfig): Promise<void>` — 原子写（tmp + rename）
    - `getEndpoints(): Promise<Record<string, string>>` — config.endpoints 非空用之，否则 DEFAULT_ENDPOINTS
    - `setEndpoints(endpoints: Record<string, string>): Promise<void>` — 校验后保存
    - `validateEndpointName(name: string): boolean` — `/^[a-z0-9][a-z0-9_-]{0,63}$/i`

- [ ] **Step 1: 写失败测试**

Create `src/lib/sync/__tests__/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  configDir, repoDir, commonDir, metadataFile,
} from '../paths';
import {
  DEFAULT_ENDPOINTS, loadSyncConfig, saveSyncConfig, getEndpoints, setEndpoints, validateEndpointName, syncConfigPath,
} from '../config';

const tmpHome = path.join(os.tmpdir(), `aihome-sync-test-${process.pid}`);
const OLD_REPO = process.env.AIHOME_REPO_DIR;
const OLD_CFG = process.env.AIHOME_CONFIG_DIR;

beforeEach(async () => {
  process.env.AIHOME_REPO_DIR = path.join(tmpHome, 'repo');
  process.env.AIHOME_CONFIG_DIR = path.join(tmpHome, 'config');
  await fs.mkdir(path.join(tmpHome, 'config'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpHome, { recursive: true, force: true });
  if (OLD_REPO === undefined) delete process.env.AIHOME_REPO_DIR; else process.env.AIHOME_REPO_DIR = OLD_REPO;
  if (OLD_CFG === undefined) delete process.env.AIHOME_CONFIG_DIR; else process.env.AIHOME_CONFIG_DIR = OLD_CFG;
});

describe('paths', () => {
  it('resolves injected dirs', () => {
    expect(repoDir()).toBe(path.join(tmpHome, 'repo'));
    expect(commonDir()).toBe(path.join(tmpHome, 'repo', 'common'));
    expect(metadataFile()).toBe(path.join(tmpHome, 'repo', 'metadata.json'));
    expect(configDir()).toBe(path.join(tmpHome, 'config'));
  });

  it('has four default endpoints', () => {
    expect(Object.keys(DEFAULT_ENDPOINTS).sort()).toEqual(['claude', 'codex', 'hermes', 'opencode']);
  });
});

describe('sync config', () => {
  it('falls back to defaults when file missing', async () => {
    const config = await loadSyncConfig();
    expect(config).toEqual({ version: 1, endpoints: {} });
    expect(await getEndpoints()).toEqual(DEFAULT_ENDPOINTS);
  });

  it('saves and loads config', async () => {
    const endpoints = { alpha: '/tmp/alpha', beta: '/tmp/beta' };
    await setEndpoints(endpoints);
    expect(await loadSyncConfig()).toEqual({ version: 1, endpoints });
    expect(await getEndpoints()).toEqual(endpoints);
  });

  it('recovers from corrupt config', async () => {
    await fs.writeFile(syncConfigPath(), '{not json', 'utf-8');
    expect(await loadSyncConfig()).toEqual({ version: 1, endpoints: {} });
  });

  it('validates endpoint names', () => {
    expect(validateEndpointName('opencode')).toBe(true);
    expect(validateEndpointName('my-endpoint_2')).toBe(true);
    expect(validateEndpointName('has space')).toBe(false);
    expect(validateEndpointName('')).toBe(false);
    expect(validateEndpointName('UPPER')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test 2>&1 | tail -5`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 paths.ts**

Create `src/lib/sync/paths.ts`:

```typescript
import * as os from 'os';
import * as path from 'path';

export function configDir(): string {
  return process.env.AIHOME_CONFIG_DIR ?? path.join(os.homedir(), '.aihome');
}

export function repoDir(): string {
  return process.env.AIHOME_REPO_DIR ?? path.join(os.homedir(), '.aihome', 'repo');
}

export function commonDir(): string {
  return path.join(repoDir(), 'common');
}

export function metadataFile(): string {
  return path.join(repoDir(), 'metadata.json');
}
```

- [ ] **Step 4: 实现 config.ts**

Create `src/lib/sync/config.ts`:

```typescript
import { readFile, writeFile, mkdir, access, rename } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { configDir } from './paths';

export const DEFAULT_ENDPOINTS: Record<string, string> = {
  opencode: path.join(os.homedir(), '.config', 'opencode', 'skills'),
  claude: path.join(os.homedir(), '.claude', 'skills'),
  codex: path.join(os.homedir(), '.codex', 'skills'),
  hermes: path.join(os.homedir(), '.hermes', 'skills'),
};

export interface SyncConfig {
  version: 1;
  endpoints: Record<string, string>;
}

export function syncConfigPath(): string {
  return path.join(configDir(), 'sync-config.json');
}

async function ensureConfigDir(): Promise<void> {
  try {
    await access(configDir());
  } catch {
    await mkdir(configDir(), { recursive: true });
  }
}

export async function loadSyncConfig(): Promise<SyncConfig> {
  await ensureConfigDir();
  try {
    const data = JSON.parse(await readFile(syncConfigPath(), 'utf-8')) as Partial<SyncConfig>;
    if (data && typeof data === 'object' && data.endpoints && typeof data.endpoints === 'object') {
      return { version: 1, endpoints: data.endpoints as Record<string, string> };
    }
    return { version: 1, endpoints: {} };
  } catch {
    return { version: 1, endpoints: {} };
  }
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  await ensureConfigDir();
  const tmp = `${syncConfigPath()}.tmp`;
  await writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  await rename(tmp, syncConfigPath());
}

export async function getEndpoints(): Promise<Record<string, string>> {
  const config = await loadSyncConfig();
  const endpoints = config.endpoints;
  return Object.keys(endpoints).length > 0 ? endpoints : DEFAULT_ENDPOINTS;
}

export function validateEndpointName(name: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(name);
}

export async function setEndpoints(endpoints: Record<string, string>): Promise<void> {
  const cleaned: Record<string, string> = {};
  for (const [name, p] of Object.entries(endpoints)) {
    if (validateEndpointName(name) && typeof p === 'string' && p.trim()) {
      cleaned[name] = path.resolve(p.trim());
    }
  }
  await saveSyncConfig({ version: 1, endpoints: cleaned });
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: `config.test.ts` 全部通过

- [ ] **Step 6: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add src/lib/sync/paths.ts src/lib/sync/config.ts src/lib/sync/__tests__/config.test.ts && git commit -m "feat: sync 路径注入与端配置模块"
```

---

### Task 3: checksum 模块（校验和/扫描/复制）

**Files:**
- Create: `src/lib/sync/checksum.ts`
- Create: `src/lib/sync/__tests__/checksum.test.ts`

**Interfaces:**
- Consumes: 无
- Produces（engine/migration 依赖）:
  - `dirSha256(root: string): Promise<string>` — 目录级联 SHA-256（跳过隐藏项，空目录有定义）
  - `isSkillDir(dirPath: string): Promise<boolean>` — 非隐藏、非 `.zip` 后缀、目录、含 `SKILL.md`
  - `scanSkills(root: string): Promise<Record<string, string>>` — `{技能名: sha256}`，root 不存在/不可读返回 `{}`
  - `copyTree(src: string, dst: string): Promise<void>` — 递归复制，跳过 `.git` 与隐藏项
  - `atomicCopy(src: string, dst: string): Promise<void>` — 复制到 `dst.tmp-<pid>` 后原子替换

- [ ] **Step 1: 写失败测试**

Create `src/lib/sync/__tests__/checksum.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { dirSha256, isSkillDir, scanSkills, copyTree, atomicCopy } from '../checksum';

const tmp = path.join(os.tmpdir(), `aihome-checksum-test-${process.pid}`);

async function makeSkill(root: string, name: string, extra = 'content'): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\ndescription: ${name}\n---\n\n${extra}\n`, 'utf-8');
  return dir;
}

beforeEach(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe('dirSha256', () => {
  it('is stable for identical trees and differs for content changes', async () => {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    await fs.mkdir(a, { recursive: true });
    await fs.mkdir(b, { recursive: true });
    await fs.writeFile(path.join(a, 'SKILL.md'), 'same', 'utf-8');
    await fs.writeFile(path.join(b, 'SKILL.md'), 'same', 'utf-8');
    expect(await dirSha256(a)).toBe(await dirSha256(b));
    await fs.writeFile(path.join(b, 'SKILL.md'), 'different', 'utf-8');
    expect(await dirSha256(a)).not.toBe(await dirSha256(b));
  });

  it('ignores hidden files and dirs', async () => {
    const a = path.join(tmp, 'a');
    await fs.mkdir(path.join(a, '.hidden'), { recursive: true });
    await fs.writeFile(path.join(a, '.hidden', 'x'), 'secret', 'utf-8');
    await fs.writeFile(path.join(a, 'SKILL.md'), 'same', 'utf-8');
    const b = path.join(tmp, 'b');
    await fs.mkdir(b, { recursive: true });
    await fs.writeFile(path.join(b, 'SKILL.md'), 'same', 'utf-8');
    expect(await dirSha256(a)).toBe(await dirSha256(b));
  });

  it('is deterministic for an empty dir', async () => {
    const a = path.join(tmp, 'empty-a');
    const b = path.join(tmp, 'empty-b');
    await fs.mkdir(a, { recursive: true });
    await fs.mkdir(b, { recursive: true });
    expect(await dirSha256(a)).toBe(await dirSha256(b));
  });
});

describe('isSkillDir / scanSkills', () => {
  it('detects skill dirs and rejects junk', async () => {
    const root = path.join(tmp, 'endpoint');
    await makeSkill(root, 'foo');
    await fs.mkdir(path.join(root, 'junk.zip'), { recursive: true });
    await fs.mkdir(path.join(root, 'plain'), { recursive: true });
    await fs.mkdir(path.join(root, '.hidden'), { recursive: true });
    await fs.writeFile(path.join(root, '.hidden', 'SKILL.md'), 'x', 'utf-8');

    expect(await isSkillDir(path.join(root, 'foo'))).toBe(true);
    expect(await isSkillDir(path.join(root, 'junk.zip'))).toBe(false);
    expect(await isSkillDir(path.join(root, 'plain'))).toBe(false);
    expect(await isSkillDir(path.join(root, '.hidden'))).toBe(false);

    const scanned = await scanSkills(root);
    expect(Object.keys(scanned)).toEqual(['foo']);
  });

  it('returns empty map for missing root', async () => {
    expect(await scanSkills(path.join(tmp, 'nope'))).toEqual({});
  });
});

describe('copyTree / atomicCopy', () => {
  it('copies tree skipping dotfiles', async () => {
    const src = path.join(tmp, 'src');
    await makeSkill(src, 'foo');
    await fs.writeFile(path.join(src, 'foo', '.secret'), 'x', 'utf-8');
    const dst = path.join(tmp, 'dst');
    await copyTree(src, dst);
    expect(await scanSkills(dst)).toEqual(await scanSkills(src));
    expect(await fs.readFile(path.join(dst, 'foo', 'SKILL.md'), 'utf-8')).toBe(
      await fs.readFile(path.join(src, 'foo', 'SKILL.md'), 'utf-8')
    );
  });

  it('atomicCopy replaces existing destination', async () => {
    const src = path.join(tmp, 'src2');
    await makeSkill(src, 'foo', 'v2');
    const dst = path.join(tmp, 'dst2');
    await makeSkill(tmp, 'dst2', 'v1');
    await atomicCopy(src, dst);
    expect(await fs.readFile(path.join(dst, 'SKILL.md'), 'utf-8')).toContain('v2');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 checksum.ts**

Create `src/lib/sync/checksum.ts`:

```typescript
import { createHash } from 'crypto';
import { readdir, readFile, stat, access, mkdir, rename, rm, copyFile } from 'fs/promises';
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
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: `checksum.test.ts` 全部通过

- [ ] **Step 5: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add src/lib/sync/checksum.ts src/lib/sync/__tests__/checksum.test.ts && git commit -m "feat: sync 校验和/扫描/复制原语"
```

---

### Task 4: metadata 模块（清单读写与 diff 分类）

**Files:**
- Create: `src/lib/sync/metadata.ts`
- Create: `src/lib/sync/__tests__/metadata.test.ts`

**Interfaces:**
- Consumes: 无
- Produces（engine 依赖）:
  - `interface SkillMetaEntry { sha256: string; sources: string[]; updated_at: string; conflicts?: Record<string, string> }`
  - `interface SyncMetadata { version: 1; skills: Record<string, SkillMetaEntry> }`
  - `emptyMetadata(): SyncMetadata`
  - `loadMetadata(file: string): Promise<SyncMetadata>` — 缺失/损坏回退空清单
  - `saveMetadata(meta: SyncMetadata, file: string): Promise<void>` — 原子写（tmp + rename）
  - `interface SkillDiff { new: Array<[string, string]>; same: Array<[string, string]>; changed: Array<[string, string]>; conflict: Array<[string, string]> }`
  - `compareSkills(remote: Record<string, string>, skills: Record<string, SkillMetaEntry>): SkillDiff` — new=远程有清单无；same=校验和一致；changed=不一致且非冲突；conflict=清单带 conflicts 标记
  - `renderManifest(meta: SyncMetadata): string` — Markdown 清单（表头 `| 技能 | 校验和(8位) | 来源 | 冲突 |`）
  - `nowIso(): string` — UTC ISO 秒级时间戳

- [ ] **Step 1: 写失败测试**

Create `src/lib/sync/__tests__/metadata.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { emptyMetadata, loadMetadata, saveMetadata, compareSkills, renderManifest, SkillMetaEntry } from '../metadata';

const tmp = path.join(os.tmpdir(), `aihome-meta-test-${process.pid}`);

beforeEach(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

function entry(sha: string, extra: Partial<SkillMetaEntry> = {}): SkillMetaEntry {
  return { sha256: sha, sources: ['alpha'], updated_at: '2026-01-01T00:00:00+00:00', ...extra };
}

describe('load/save', () => {
  it('round-trips metadata', async () => {
    const meta = emptyMetadata();
    meta.skills.foo = entry('abc');
    const file = path.join(tmp, 'metadata.json');
    await saveMetadata(meta, file);
    expect(await loadMetadata(file)).toEqual(meta);
  });

  it('falls back to empty on missing or corrupt', async () => {
    expect(await loadMetadata(path.join(tmp, 'nope.json'))).toEqual(emptyMetadata());
    await fs.writeFile(path.join(tmp, 'bad.json'), '{oops', 'utf-8');
    expect(await loadMetadata(path.join(tmp, 'bad.json'))).toEqual(emptyMetadata());
  });
});

describe('compareSkills', () => {
  it('classifies new/same/changed/conflict', () => {
    const skills: Record<string, SkillMetaEntry> = {
      same: entry('sha-same'),
      changed: entry('sha-old'),
      conflict: entry('sha-c', { conflicts: { beta: 'sha-b' } }),
    };
    const remote = { same: 'sha-same', changed: 'sha-new', conflict: 'sha-c', fresh: 'sha-fresh' };
    const diff = compareSkills(remote, skills);
    expect(diff.new).toEqual([['fresh', 'sha-fresh']]);
    expect(diff.same).toEqual([['same', 'sha-same']]);
    expect(diff.changed).toEqual([['changed', 'sha-new']]);
    expect(diff.conflict).toEqual([['conflict', 'sha-c']]);
  });
});

describe('renderManifest', () => {
  it('renders rows with sha8 and conflicts', () => {
    const meta = emptyMetadata();
    meta.skills.foo = entry('abcdef1234567890');
    meta.skills.bar = entry('deadbeef00000000', { conflicts: { beta: 'x' } });
    const text = renderManifest(meta);
    expect(text).toContain('| foo | abcdef12 | alpha | - |');
    expect(text).toContain('| bar | deadbeef | alpha | beta |');
    expect(text).toContain('技能总数: 2 | 冲突: 1');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 metadata.ts**

Create `src/lib/sync/metadata.ts`:

```typescript
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: `metadata.test.ts` 全部通过

- [ ] **Step 5: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add src/lib/sync/metadata.ts src/lib/sync/__tests__/metadata.test.ts && git commit -m "feat: sync 清单读写与 diff 分类"
```

---

### Task 5: git 模块

**Files:**
- Create: `src/lib/sync/git.ts`
- Create: `src/lib/sync/__tests__/git.test.ts`

**Interfaces:**
- Consumes: 无
- Produces（engine 依赖）:
  - `export type GitErrorCode = 'GIT_MISSING' | 'GIT_CONFLICT' | 'GIT_PERMISSION' | 'GIT_OTHER'`
  - `gitCommit(repoDir: string, message: string): Promise<{ ok: boolean; code?: GitErrorCode }>` — 无 `.git` 先 `git init`；无暂存变更直接成功；提交成功 `{ok: true}`

- [ ] **Step 1: 写失败测试**

Create `src/lib/sync/__tests__/git.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { gitCommit } from '../git';

const execFileAsync = promisify(execFile);
const tmp = path.join(os.tmpdir(), `aihome-git-test-${process.pid}`);

beforeEach(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe('gitCommit', () => {
  it('inits repo and commits changes', async () => {
    const repo = path.join(tmp, 'repo');
    await fs.mkdir(path.join(repo, 'common'), { recursive: true });
    await fs.writeFile(path.join(repo, 'common', 'x.txt'), 'v1', 'utf-8');
    const result = await gitCommit(repo, 'sync: test');
    expect(result.ok).toBe(true);
    const log = await execFileAsync('git', ['log', '--oneline'], { cwd: repo });
    expect(log.stdout).toContain('sync: test');
  });

  it('returns ok when nothing changed', async () => {
    const repo = path.join(tmp, 'repo2');
    await fs.mkdir(path.join(repo, 'common'), { recursive: true });
    await fs.writeFile(path.join(repo, 'common', 'x.txt'), 'v1', 'utf-8');
    await gitCommit(repo, 'sync: first');
    const result = await gitCommit(repo, 'sync: second');
    expect(result.ok).toBe(true);
    const log = await execFileAsync('git', ['log', '--oneline'], { cwd: repo });
    expect(log.stdout.split('\n').length).toBe(2); // 只有 first 一次提交
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 git.ts**

Create `src/lib/sync/git.ts`:

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
import { access, mkdir } from 'fs/promises';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export type GitErrorCode = 'GIT_MISSING' | 'GIT_CONFLICT' | 'GIT_PERMISSION' | 'GIT_OTHER';

export function classifyGitError(err: unknown): GitErrorCode {
  const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
  if (e?.code === 'ENOENT') return 'GIT_MISSING';
  const text = `${e?.stderr ?? ''} ${e?.stdout ?? ''} ${e?.message ?? ''}`;
  if (/permission denied|eacces/i.test(text)) return 'GIT_PERMISSION';
  if (/unmerged|merge conflict|conflict/i.test(text)) return 'GIT_CONFLICT';
  return 'GIT_OTHER';
}

export async function gitCommit(
  repoDir: string,
  message: string
): Promise<{ ok: boolean; code?: GitErrorCode }> {
  try {
    try {
      await access(path.join(repoDir, '.git'));
    } catch {
      await mkdir(repoDir, { recursive: true });
      await execFileAsync('git', ['init'], { cwd: repoDir });
    }
    await execFileAsync('git', ['add', '-A'], { cwd: repoDir });
    try {
      await execFileAsync('git', ['diff', '--cached', '--quiet'], { cwd: repoDir });
      return { ok: true }; // 无变更
    } catch {
      await execFileAsync('git', ['commit', '-m', message], { cwd: repoDir });
      return { ok: true };
    }
  } catch (err) {
    return { ok: false, code: classifyGitError(err) };
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: `git.test.ts` 全部通过

- [ ] **Step 5: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add src/lib/sync/git.ts src/lib/sync/__tests__/git.test.ts && git commit -m "feat: sync git 提交与错误分类"
```

---

### Task 6: engine —— collect

**Files:**
- Create: `src/lib/sync/engine.ts`
- Create: `src/lib/sync/__tests__/engine-collect.test.ts`

**Interfaces:**
- Consumes: `paths.ts`、`checksum.ts`、`metadata.ts`、`git.ts`、`config.ts`
- Produces（Task 7 共用类型，Task 9 API 依赖）:
  - `export interface SyncAction { kind: 'collect' | 'push' | 'skip'; message: string }`
  - `export interface CollectStats { new: number; updated: number; conflict: number; skipped: number }`
  - `export interface CollectResult { stats: CollectStats; actions: SyncAction[]; warnings: string[] }`
  - `collect(only?: string[], dryRun?: boolean): Promise<CollectResult>` — 四端 → 中心仓库；dryRun 只统计不落盘；落盘时写 metadata.json + MANIFEST.md + git commit
  - 内部 `resolveEndpoints(only?: string[]): Promise<Record<string, string>>` — only 过滤 + 未知端名抛 `Error('未知端名: ...')`

- [ ] **Step 1: 写失败测试**

Create `src/lib/sync/__tests__/engine-collect.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { collect } from '../engine';
import { loadMetadata, saveMetadata, SkillMetaEntry } from '../metadata';
import { commonDir, metadataFile } from '../paths';
import { scanSkills, dirSha256 } from '../checksum';

const tmp = path.join(os.tmpdir(), `aihome-collect-test-${process.pid}`);
const endpoints = { alpha: path.join(tmp, 'alpha'), beta: path.join(tmp, 'beta') };
const OLD_REPO = process.env.AIHOME_REPO_DIR;
const OLD_CFG = process.env.AIHOME_CONFIG_DIR;

async function makeSkill(root: string, name: string, extra = 'content'): Promise<void> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\ndescription: ${name}\n---\n\n${extra}\n`, 'utf-8');
}

beforeEach(async () => {
  process.env.AIHOME_REPO_DIR = path.join(tmp, 'repo');
  process.env.AIHOME_CONFIG_DIR = path.join(tmp, 'config');
  await fs.mkdir(endpoints.alpha, { recursive: true });
  await fs.mkdir(endpoints.beta, { recursive: true });
  await fs.mkdir(path.join(tmp, 'config'), { recursive: true });
  await fs.writeFile(
    path.join(tmp, 'config', 'sync-config.json'),
    JSON.stringify({ version: 1, endpoints }),
    'utf-8'
  );
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  if (OLD_REPO === undefined) delete process.env.AIHOME_REPO_DIR; else process.env.AIHOME_REPO_DIR = OLD_REPO;
  if (OLD_CFG === undefined) delete process.env.AIHOME_CONFIG_DIR; else process.env.AIHOME_CONFIG_DIR = OLD_CFG;
});

describe('collect', () => {
  it('collects new skills and records sources', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    const result = await collect();
    expect(result.stats).toMatchObject({ new: 1, updated: 0, conflict: 0, skipped: 0 });
    expect(await scanSkills(commonDir())).toHaveProperty('foo');
    const meta = await loadMetadata(metadataFile());
    expect(meta.skills.foo.sources).toContain('alpha');
  });

  it('detects same-name conflicts and keeps name@endpoint copies', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await makeSkill(endpoints.beta, 'foo', 'v2-different');
    await makeSkill(endpoints.beta, 'bar', 'unique');
    const result = await collect();
    expect(result.stats).toMatchObject({ new: 2, conflict: 1, skipped: 0 });
    expect(await scanSkills(commonDir())).toHaveProperty('foo');
    expect(await scanSkills(commonDir())).toHaveProperty('foo@beta');
    expect(await scanSkills(commonDir())).toHaveProperty('bar');
    const meta = await loadMetadata(metadataFile());
    expect(meta.skills.foo.conflicts).toEqual({ beta: await dirSha256(path.join(endpoints.beta, 'foo')) });
  });

  it('ignores junk: zip, no SKILL.md, hidden dirs', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    await fs.mkdir(path.join(endpoints.alpha, 'junk.zip'), { recursive: true });
    await fs.mkdir(path.join(endpoints.alpha, 'plain'), { recursive: true });
    await fs.mkdir(path.join(endpoints.alpha, '.hidden'), { recursive: true });
    await fs.writeFile(path.join(endpoints.alpha, '.hidden', 'SKILL.md'), 'x', 'utf-8');
    await collect();
    const names = Object.keys(await scanSkills(commonDir()));
    expect(names).toEqual(['foo']);
  });

  it('dry run writes nothing', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    const result = await collect([], true);
    expect(result.stats).toMatchObject({ new: 1 });
    expect(await scanSkills(commonDir())).toEqual({});
  });

  it('skips unchanged skills on second run (idempotent)', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    await collect();
    const result = await collect();
    expect(result.stats).toMatchObject({ new: 0, conflict: 0, skipped: 1 });
  });

  it('updates metadata when collected skill already exists identical', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    await collect();
    const meta = await loadMetadata(metadataFile());
    meta.skills.foo.sources = [];
    await saveMetadata(meta, metadataFile());
    await collect();
    const after = await loadMetadata(metadataFile());
    expect(after.skills.foo.sources).toContain('alpha');
  });

  it('rejects unknown endpoint names', async () => {
    await expect(collect(['nope'])).rejects.toThrow('未知端名');
  });

  it('warns when endpoint path missing', async () => {
    await fs.rm(endpoints.beta, { recursive: true, force: true });
    const result = await collect();
    expect(result.warnings.some((w) => w.includes('beta'))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 engine.ts（collect 部分）**

Create `src/lib/sync/engine.ts`:

```typescript
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
```

注意：collect 中「端路径缺失」的处理与 Python 一致——先 `scanSkills`（缺失返回 `{}`），再尝试 `mkdir` 后重扫；仍为空则记 warning 跳过。缺失端不报错。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: `engine-collect.test.ts` 全部通过

- [ ] **Step 5: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add src/lib/sync/engine.ts src/lib/sync/__tests__/engine-collect.test.ts && git commit -m "feat: sync collect 引擎"
```

---

### Task 7: engine —— push 与 buildState

**Files:**
- Modify: `src/lib/sync/engine.ts`（追加 push、buildState）
- Create: `src/lib/sync/__tests__/engine-push.test.ts`
- Create: `src/lib/sync/__tests__/engine-state.test.ts`

**Interfaces:**
- Consumes: Task 6 全部类型
- Produces（Task 9 API 依赖）:
  - `export interface PushStats { updated: number; skipped: number }`
  - `export interface PushResult { stats: PushStats; actions: SyncAction[]; warnings: string[] }`
  - `push(only?: string[], dryRun?: boolean): Promise<PushResult>` — common/ 非冲突技能 → 各端；幂等跳过；覆盖分歧版本时 warning；dryRun 跳过 git commit
  - `export interface EndpointState { path: string; exists: boolean; count: number; diff: { missing: number; same: number; different: number; extra: number } }`
  - `export interface SyncSkillState { name: string; sha256: string; sha8: string; sources: string[]; updated_at: string; conflicts: Record<string, string>; endpoint_state: Record<string, string> }`
  - `export interface SyncConflict { name: string; versions: string[]; sha256: string[]; endpoint: string }`
  - `export interface SyncState { generated_at: string; summary: { total_skills: number; conflict_count: number; endpoint_count: number }; endpoints: Record<string, EndpointState>; skills: SyncSkillState[]; conflicts: SyncConflict[] }`
  - `buildState(): Promise<SyncState>` — 移植 Python build_state（metadata 快照 + 各端实时扫描 + missing/same/different/extra 分类）

- [ ] **Step 1: 写失败测试（push）**

Create `src/lib/sync/__tests__/engine-push.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { collect, push } from '../engine';
import { scanSkills } from '../checksum';

const tmp = path.join(os.tmpdir(), `aihome-push-test-${process.pid}`);
const endpoints = {
  alpha: path.join(tmp, 'alpha'),
  beta: path.join(tmp, 'beta'),
  gamma: path.join(tmp, 'gamma'),
};
const OLD_REPO = process.env.AIHOME_REPO_DIR;
const OLD_CFG = process.env.AIHOME_CONFIG_DIR;

async function makeSkill(root: string, name: string, extra = 'content'): Promise<void> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\ndescription: ${name}\n---\n\n${extra}\n`, 'utf-8');
}

beforeEach(async () => {
  process.env.AIHOME_REPO_DIR = path.join(tmp, 'repo');
  process.env.AIHOME_CONFIG_DIR = path.join(tmp, 'config');
  await fs.mkdir(path.join(tmp, 'config'), { recursive: true });
  await fs.writeFile(
    path.join(tmp, 'config', 'sync-config.json'),
    JSON.stringify({ version: 1, endpoints }),
    'utf-8'
  );
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  if (OLD_REPO === undefined) delete process.env.AIHOME_REPO_DIR; else process.env.AIHOME_REPO_DIR = OLD_REPO;
  if (OLD_CFG === undefined) delete process.env.AIHOME_CONFIG_DIR; else process.env.AIHOME_CONFIG_DIR = OLD_CFG;
});

describe('push', () => {
  it('installs non-conflicting skills to a fresh endpoint and is idempotent', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await makeSkill(endpoints.beta, 'foo', 'v2-different');
    await makeSkill(endpoints.beta, 'bar', 'unique');
    await collect();

    const result = await push();
    expect(result.stats.updated).toBeGreaterThan(0);
    expect(await scanSkills(endpoints.gamma)).toHaveProperty('bar');
    const bar = await fs.readFile(path.join(endpoints.gamma, 'bar', 'SKILL.md'), 'utf-8');
    expect(bar).toContain('unique');

    const before = await scanSkills(endpoints.gamma);
    await push();
    expect(await scanSkills(endpoints.gamma)).toEqual(before);
  });

  it('does not overwrite conflicted skill copies anywhere', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await makeSkill(endpoints.beta, 'foo', 'v2-different');
    await collect();
    await push();
    expect(await fs.readFile(path.join(endpoints.beta, 'foo', 'SKILL.md'), 'utf-8')).toContain('v2-different');
    expect(await fs.readFile(path.join(endpoints.alpha, 'foo', 'SKILL.md'), 'utf-8')).toContain('v1');
    expect(await scanSkills(endpoints.gamma)).not.toHaveProperty('foo');
  });

  it('warns before overwriting a diverged endpoint copy', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await collect();
    await fs.writeFile(path.join(endpoints.alpha, 'foo', 'SKILL.md'), 'local edit', 'utf-8');
    const result = await push(['alpha']);
    expect(result.warnings.some((w) => w.includes('alpha:foo'))).toBe(true);
    expect(await fs.readFile(path.join(endpoints.alpha, 'foo', 'SKILL.md'), 'utf-8')).toContain('v1');
  });

  it('dry run does not touch endpoints', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await collect();
    const result = await push([], true);
    expect(result.stats.updated).toBeGreaterThan(0);
    expect(await scanSkills(endpoints.gamma)).toEqual({});
  });

  it('rejects unknown endpoint names', async () => {
    await expect(push(['nope'])).rejects.toThrow('未知端名');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: FAIL（push 未定义）

- [ ] **Step 3: 写失败测试（buildState）**

Create `src/lib/sync/__tests__/engine-state.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { collect, buildState } from '../engine';

const tmp = path.join(os.tmpdir(), `aihome-state-test-${process.pid}`);
const endpoints = { alpha: path.join(tmp, 'alpha'), beta: path.join(tmp, 'beta') };
const OLD_REPO = process.env.AIHOME_REPO_DIR;
const OLD_CFG = process.env.AIHOME_CONFIG_DIR;

async function makeSkill(root: string, name: string, extra = 'content'): Promise<void> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\ndescription: ${name}\n---\n\n${extra}\n`, 'utf-8');
}

beforeEach(async () => {
  process.env.AIHOME_REPO_DIR = path.join(tmp, 'repo');
  process.env.AIHOME_CONFIG_DIR = path.join(tmp, 'config');
  await fs.mkdir(path.join(tmp, 'config'), { recursive: true });
  await fs.writeFile(
    path.join(tmp, 'config', 'sync-config.json'),
    JSON.stringify({ version: 1, endpoints }),
    'utf-8'
  );
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  if (OLD_REPO === undefined) delete process.env.AIHOME_REPO_DIR; else process.env.AIHOME_REPO_DIR = OLD_REPO;
  if (OLD_CFG === undefined) delete process.env.AIHOME_CONFIG_DIR; else process.env.AIHOME_CONFIG_DIR = OLD_CFG;
});

describe('buildState', () => {
  it('classifies endpoint diffs missing/same/different/extra', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await makeSkill(endpoints.beta, 'foo', 'v2');
    await collect();

    const state = await buildState();
    expect(state.summary.total_skills).toBe(1);
    expect(state.summary.conflict_count).toBe(1);
    expect(state.summary.endpoint_count).toBe(2);

    const alpha = state.endpoints.alpha;
    const beta = state.endpoints.beta;
    expect(alpha.diff.same).toBe(1);
    expect(beta.diff.different).toBe(1);
    expect(alpha.diff.missing).toBe(0);

    const foo = state.skills.find((s) => s.name === 'foo');
    expect(foo?.endpoint_state.alpha).toBe('same');
    expect(foo?.endpoint_state.beta).toBe('different');
    expect(foo?.conflicts.beta).toBeTruthy();
  });

  it('reports extra skills and missing endpoints', async () => {
    await makeSkill(endpoints.alpha, 'only-here');
    await fs.rm(endpoints.beta, { recursive: true, force: true });
    const state = await buildState();
    expect(state.endpoints.alpha.diff.extra).toBe(1);
    expect(state.endpoints.beta.exists).toBe(false);
    expect(state.endpoints.beta.count).toBe(0);
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: FAIL（buildState 未定义）

- [ ] **Step 5: 实现 push 与 buildState（追加到 engine.ts）**

在 `src/lib/sync/engine.ts` 末尾追加：

```typescript
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
      await mkdir(endpointPath, { recursive: true });
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
    await gitCommit(repoDir(), `sync: push ${stats.updated} updated, ${stats.skipped} skipped`);
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
```

注意：engine.ts 顶部 imports 需补 `access`（`fs/promises`）、`getEndpoints`（`./config`）。buildState 中 `endpoint_state` 对不存在端也填充 `missing`。

- [ ] **Step 6: 跑测试确认通过**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: `engine-push.test.ts`、`engine-state.test.ts` 全部通过

- [ ] **Step 7: lint 与 tsc 检查**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run lint && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 8: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add src/lib/sync/engine.ts src/lib/sync/__tests__/engine-push.test.ts src/lib/sync/__tests__/engine-state.test.ts && git commit -m "feat: sync push 引擎与状态聚合"
```

---

### Task 8: migration 模块

**Files:**
- Create: `src/lib/sync/migration.ts`
- Create: `src/lib/sync/__tests__/migration.test.ts`

**Interfaces:**
- Consumes: `paths.ts`、`checksum.ts`
- Produces（Task 9 API 依赖）:
  - `detectLegacyRepo(): Promise<string | null>` — `~/skill-sync` 存在且含 `common/` 与 `metadata.json` 时返回其绝对路径，否则 null
  - `export interface MigrationResult { migrated: boolean; copiedSkills: number; reason: 'no-legacy' | 'already-migrated' | 'ok' }`
  - `migrateLegacyRepo(): Promise<MigrationResult>` — 幂等：无旧仓库 → no-legacy；目标 repo 已存在 → already-migrated；否则复制 `common/` + `metadata.json` + `MANIFEST.md`（存在才复制），写 `.migrated-from` 标记文件（内容为旧路径），返回 ok

- [ ] **Step 1: 写失败测试**

Create `src/lib/sync/__tests__/migration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { detectLegacyRepo, migrateLegacyRepo } from '../migration';
import { repoDir, commonDir } from '../paths';
import { scanSkills } from '../checksum';

const tmp = path.join(os.tmpdir(), `aihome-migration-test-${process.pid}`);
const OLD_REPO = process.env.AIHOME_REPO_DIR;
const OLD_CFG = process.env.AIHOME_CONFIG_DIR;

async function makeSkill(root: string, name: string, extra = 'content'): Promise<void> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\ndescription: ${name}\n---\n\n${extra}\n`, 'utf-8');
}

beforeEach(async () => {
  process.env.AIHOME_REPO_DIR = path.join(tmp, 'repo');
  process.env.AIHOME_CONFIG_DIR = path.join(tmp, 'config');
  await fs.mkdir(path.join(tmp, 'config'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  if (OLD_REPO === undefined) delete process.env.AIHOME_REPO_DIR; else process.env.AIHOME_REPO_DIR = OLD_REPO;
  if (OLD_CFG === undefined) delete process.env.AIHOME_CONFIG_DIR; else process.env.AIHOME_CONFIG_DIR = OLD_CFG;
});

describe('migration', () => {
  it('detects legacy repo at ~/skill-sync when present', async () => {
    const legacy = path.join(os.homedir(), 'skill-sync');
    const present = await fs.access(path.join(legacy, 'metadata.json')).then(() => true).catch(() => false);
    expect(await detectLegacyRepo()).toBe(present ? legacy : null);
  });

  it('migrates legacy common and metadata into repo dir', async () => {
    const legacy = path.join(tmp, 'fake-legacy');
    await makeSkill(path.join(legacy, 'common'), 'foo');
    await makeSkill(path.join(legacy, 'common'), 'bar');
    await fs.writeFile(
      path.join(legacy, 'metadata.json'),
      JSON.stringify({ version: 1, skills: {} }),
      'utf-8'
    );
    await fs.writeFile(path.join(legacy, 'MANIFEST.md'), '# manifest', 'utf-8');
    vi.spyOn(os, 'homedir').mockReturnValue(tmp);

    const result = await migrateLegacyRepo();
    expect(result).toEqual({ migrated: true, copiedSkills: 2, reason: 'ok' });
    expect(Object.keys(await scanSkills(commonDir()))).toEqual(['bar', 'foo']);
    const marker = await fs.readFile(path.join(repoDir(), '.migrated-from'), 'utf-8');
    expect(marker).toBe(legacy);
    vi.restoreAllMocks();
  });

  it('is idempotent: second call reports already-migrated', async () => {
    const legacy = path.join(tmp, 'fake-legacy');
    await makeSkill(path.join(legacy, 'common'), 'foo');
    await fs.writeFile(
      path.join(legacy, 'metadata.json'),
      JSON.stringify({ version: 1, skills: {} }),
      'utf-8'
    );
    vi.spyOn(os, 'homedir').mockReturnValue(tmp);

    await migrateLegacyRepo();
    const second = await migrateLegacyRepo();
    expect(second).toEqual({ migrated: false, copiedSkills: 0, reason: 'already-migrated' });
    vi.restoreAllMocks();
  });

  it('reports no-legacy when absent', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(tmp);
    const result = await migrateLegacyRepo();
    expect(result).toEqual({ migrated: false, copiedSkills: 0, reason: 'no-legacy' });
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 migration.ts**

Create `src/lib/sync/migration.ts`:

```typescript
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { repoDir, commonDir } from './paths';
import { copyTree, scanSkills } from './checksum';

export async function detectLegacyRepo(): Promise<string | null> {
  const legacy = path.join(os.homedir(), 'skill-sync');
  try {
    await fs.access(path.join(legacy, 'common'));
    await fs.access(path.join(legacy, 'metadata.json'));
    return legacy;
  } catch {
    return null;
  }
}

export interface MigrationResult {
  migrated: boolean;
  copiedSkills: number;
  reason: 'no-legacy' | 'already-migrated' | 'ok';
}

export async function migrateLegacyRepo(): Promise<MigrationResult> {
  const legacy = await detectLegacyRepo();
  if (legacy === null) return { migrated: false, copiedSkills: 0, reason: 'no-legacy' };

  try {
    await fs.access(repoDir());
    return { migrated: false, copiedSkills: 0, reason: 'already-migrated' };
  } catch {
    // repo dir 不存在，继续迁移
  }

  await fs.mkdir(repoDir(), { recursive: true });
  await copyTree(path.join(legacy, 'common'), commonDir());
  for (const file of ['metadata.json', 'MANIFEST.md']) {
    try {
      await fs.copyFile(path.join(legacy, file), path.join(repoDir(), file));
    } catch {
      // 可选文件缺失不阻塞迁移
    }
  }
  await fs.writeFile(path.join(repoDir(), '.migrated-from'), legacy, 'utf-8');

  let copiedSkills = 0;
  try {
    copiedSkills = Object.keys(await scanSkills(commonDir())).length;
  } catch {
    copiedSkills = 0;
  }
  return { migrated: true, copiedSkills, reason: 'ok' };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: `migration.test.ts` 全部通过

- [ ] **Step 5: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add src/lib/sync/migration.ts src/lib/sync/__tests__/migration.test.ts && git commit -m "feat: 旧 skill-sync 仓库一次性迁移"
```

---

### Task 9: API 路由

**Files:**
- Create: `src/app/api/sync/status/route.ts`
- Create: `src/app/api/sync/collect/route.ts`
- Create: `src/app/api/sync/push/route.ts`
- Create: `src/app/api/sync/conflicts/route.ts`
- Create: `src/app/api/sync/endpoints/route.ts`

**Interfaces:**
- Consumes: engine 全部、migration、config
- Produces（Task 10 UI 依赖）:
  - `GET /api/sync/status` → `200 { state: SyncState; legacy: { present: boolean; migrated: boolean; copiedSkills?: number } }`；首次访问自动迁移旧仓库（幂等），migrated=true 时附带 copiedSkills
  - `POST /api/sync/collect` body `{ only?: string[] }` query `dryRun` → `200 CollectResult`
  - `POST /api/sync/push` body `{ only?: string[] }` query `dryRun` → `200 PushResult`
  - `GET /api/sync/conflicts` → `200 SyncConflict[]`
  - `GET/PUT /api/sync/endpoints` → `200 { endpoints }`；PUT 非法端名/空路径 → `400`

- [ ] **Step 1: 创建五个路由**

Create `src/app/api/sync/status/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { buildState } from '@/lib/sync/engine';
import { detectLegacyRepo, migrateLegacyRepo } from '@/lib/sync/migration';

export async function GET() {
  try {
    const state = await buildState();
    const legacyPath = await detectLegacyRepo();
    const legacy: { present: boolean; migrated: boolean; copiedSkills?: number } = {
      present: legacyPath !== null,
      migrated: false,
    };
    if (legacyPath !== null) {
      const result = await migrateLegacyRepo();
      legacy.migrated = true;
      if (result.migrated) legacy.copiedSkills = result.copiedSkills;
    }
    return NextResponse.json({ state, legacy });
  } catch (error) {
    console.error('Sync status error:', error);
    return NextResponse.json({ error: 'Failed to load sync status' }, { status: 500 });
  }
}
```

Create `src/app/api/sync/collect/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { collect } from '@/lib/sync/engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const only = Array.isArray(body.only) ? body.only.filter((n: unknown) => typeof n === 'string') : undefined;
    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
    const result = await collect(only, dryRun);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to collect' },
      { status: 400 }
    );
  }
}
```

Create `src/app/api/sync/push/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { push } from '@/lib/sync/engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const only = Array.isArray(body.only) ? body.only.filter((n: unknown) => typeof n === 'string') : undefined;
    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
    const result = await push(only, dryRun);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to push' },
      { status: 400 }
    );
  }
}
```

Create `src/app/api/sync/conflicts/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { buildState } from '@/lib/sync/engine';

export async function GET() {
  try {
    const state = await buildState();
    return NextResponse.json(state.conflicts);
  } catch (error) {
    console.error('Sync conflicts error:', error);
    return NextResponse.json({ error: 'Failed to load conflicts' }, { status: 500 });
  }
}
```

Create `src/app/api/sync/endpoints/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getEndpoints, setEndpoints, validateEndpointName } from '@/lib/sync/config';

export async function GET() {
  try {
    const endpoints = await getEndpoints();
    return NextResponse.json({ endpoints });
  } catch (error) {
    console.error('Sync endpoints error:', error);
    return NextResponse.json({ error: 'Failed to load endpoints' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const endpoints = body.endpoints;
    if (!endpoints || typeof endpoints !== 'object') {
      return NextResponse.json({ error: 'endpoints 必须是非空对象' }, { status: 400 });
    }
    const entries = Object.entries(endpoints as Record<string, unknown>);
    if (entries.some(([name, p]) => !validateEndpointName(name) || typeof p !== 'string' || !p.trim())) {
      return NextResponse.json({ error: '存在非法端名或空路径' }, { status: 400 });
    }
    await setEndpoints(endpoints as Record<string, string>);
    return NextResponse.json({ endpoints: await getEndpoints() });
  } catch (error) {
    console.error('Sync endpoints save error:', error);
    return NextResponse.json({ error: 'Failed to save endpoints' }, { status: 500 });
  }
}
```

- [ ] **Step 2: lint 与 tsc**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run lint && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: dev 服务器冒烟**

Run:
```bash
cd /Users/gstar/Documents/05-项目代码/AIHome
AIHOME_REPO_DIR=/tmp/aihome-smoke-repo AIHOME_CONFIG_DIR=/tmp/aihome-smoke-config npm run dev >/tmp/aihome-smoke.log 2>&1 &
sleep 10
mkdir -p /tmp/aihome-smoke-alpha/foo
printf -- '---\ndescription: foo\n---\n\nv1\n' > /tmp/aihome-smoke-alpha/foo/SKILL.md
mkdir -p /tmp/aihome-smoke-config
printf '{"version":1,"endpoints":{"alpha":"/tmp/aihome-smoke-alpha"}}' > /tmp/aihome-smoke-config/sync-config.json
curl -s -X POST http://localhost:3000/api/sync/collect | python3 -m json.tool | head -12
curl -s http://localhost:3000/api/sync/status | python3 -m json.tool | head -20
curl -s http://localhost:3000/api/sync/conflicts
kill %1
rm -rf /tmp/aihome-smoke-repo /tmp/aihome-smoke-config /tmp/aihome-smoke-alpha
```
Expected: collect 返回 `stats.new == 1`；status 显示 alpha 端与中心仓库；conflicts 返回 `[]`

- [ ] **Step 4: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add src/app/api/sync && git commit -m "feat: sync API 路由（status/collect/push/conflicts/endpoints）"
```

---

### Task 10: 同步页与设置页 UI

**Files:**
- Create: `src/app/sync/page.tsx`
- Create: `src/components/sync/SyncStatusPanel.tsx`
- Create: `src/components/sync/ConflictsList.tsx`
- Create: `src/components/sync/EndpointSettings.tsx`
- Modify: `src/components/layout/TopNav.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: Task 9 API（`/api/sync/status`、`/api/sync/collect?dryRun=`、`/api/sync/push?dryRun=`、`/api/sync/endpoints`）；类型从 `@/lib/sync/engine` 导入（SyncState、SyncConflict）
- Produces（Task 11 e2e 依赖）:
  - `/sync` 页面：`main h1` 文本 `Skill Sync`；collect/push 按钮文本小写 `collect`/`push`；冲突标题 `冲突`；dry-run 复选框
  - 设置页新增「同步端点」区块（EndpointSettings 组件）

- [ ] **Step 1: 写 SyncStatusPanel**

Create `src/components/sync/SyncStatusPanel.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Upload, Download } from 'lucide-react';
import type { SyncState } from '@/lib/sync/engine';

interface Props {
  state: SyncState;
  onChanged: () => void;
}

export function SyncStatusPanel({ state, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  const run = async (kind: 'collect' | 'push') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sync/${kind}?dryRun=${dryRun}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? `Failed to ${kind}`);
        return;
      }
      if (kind === 'collect') {
        const s = data.stats;
        toast.info(`collect: ${s.new} 新增, ${s.updated} 更新, ${s.conflict} 冲突, ${s.skipped} 跳过${dryRun ? '（dry-run）' : ''}`);
      } else {
        toast.info(`push: ${data.stats.updated} 更新, ${data.stats.skipped} 跳过${dryRun ? '（dry-run）' : ''}`);
      }
      if (!dryRun) onChanged();
    } catch {
      toast.error(`Failed to ${kind}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-heading text-xl font-semibold">中心仓库</h2>
        <span className="text-sm text-secondary">{state.summary.total_skills} 技能</span>
        <span className="text-sm text-amber-600">{state.summary.conflict_count} 冲突</span>
        <span className="text-sm text-secondary">{state.summary.endpoint_count} 端</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        {Object.entries(state.endpoints).map(([name, ep]) => (
          <div key={name} className="border border-divider rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${ep.exists ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {ep.exists ? '在线' : '路径缺失'}
              </span>
            </div>
            <p className="text-xs text-secondary truncate mb-2" title={ep.path}>{ep.path}</p>
            <p className="text-sm">
              {ep.count} 技能 · 缺 {ep.diff.missing} · 不同 {ep.diff.different} · 端独有 {ep.diff.extra}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => run('collect')}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
        >
          <Download size={16} /> collect
        </button>
        <button
          onClick={() => run('push')}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
        >
          <Upload size={16} /> push
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          dry-run
        </label>
        <button onClick={onChanged} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary">
          <RefreshCw size={16} /> 刷新
        </button>
      </div>
    </section>
  );
}
```

注意：`border-divider`、`text-primary`、`text-secondary`、`font-heading` 为项目现有 Tailwind 自定义 token（见 board/settings 页面），保持统一；若 `bg-primary` 按钮样式与现有页面不一致，以现有按钮类为准微调。

- [ ] **Step 2: 写 ConflictsList**

Create `src/components/sync/ConflictsList.tsx`：

```tsx
'use client';

import type { SyncConflict } from '@/lib/sync/engine';

export function ConflictsList({ conflicts }: { conflicts: SyncConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <section>
        <h2 className="font-heading text-xl font-semibold mb-2">冲突</h2>
        <p className="text-sm text-secondary">无冲突</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="font-heading text-xl font-semibold mb-2">冲突（{conflicts.length}）</h2>
      <div className="border border-divider rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">技能</th>
              <th className="px-4 py-2">版本</th>
              <th className="px-4 py-2">来源端</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((c) => (
              <tr key={c.name} className="border-t border-divider">
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2 text-secondary">{c.versions.join(' · ')}</td>
                <td className="px-4 py-2">{c.endpoint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 写同步页**

Create `src/app/sync/page.tsx`：

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { SyncState } from '@/lib/sync/engine';
import { SyncStatusPanel } from '@/components/sync/SyncStatusPanel';
import { ConflictsList } from '@/components/sync/ConflictsList';

interface LegacyInfo {
  present: boolean;
  migrated: boolean;
  copiedSkills?: number;
}

export default function SyncPage() {
  const [state, setState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to load sync status');
        return;
      }
      setState(data.state);
      const legacy: LegacyInfo | undefined = data.legacy;
      if (legacy?.migrated && legacy.copiedSkills !== undefined) {
        toast.success(`已从 ~/skill-sync 迁移 ${legacy.copiedSkills} 个技能到 ~/.aihome/repo（旧目录保留，可手动删除）`);
      }
    } catch {
      toast.error('Failed to load sync status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch sync status on mount
    loadStatus();
  }, [loadStatus]);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="font-heading text-3xl font-bold text-primary mb-6">Skill Sync</h1>
      {loading ? (
        <p className="text-sm text-secondary">加载中…</p>
      ) : state ? (
        <>
          <SyncStatusPanel state={state} onChanged={loadStatus} />
          <ConflictsList conflicts={state.conflicts} />
        </>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 4: 写 EndpointSettings 并接入设置页**

Create `src/components/sync/EndpointSettings.tsx`：

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';

export function EndpointSettings() {
  const [endpoints, setEndpoints] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/endpoints');
      const data = await res.json();
      if (res.ok) setEndpoints(data.endpoints);
      else toast.error(data.error ?? 'Failed to load sync endpoints');
    } catch {
      toast.error('Failed to load sync endpoints');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch endpoints on mount
    load();
  }, [load]);

  const handleSave = async () => {
    try {
      const res = await fetch('/api/sync/endpoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoints }),
      });
      const data = await res.json();
      if (res.ok) {
        setEndpoints(data.endpoints);
        toast.success('Sync endpoints saved');
      } else {
        toast.error(data.error ?? 'Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleAdd = () => {
    if (!newName.trim() || !newPath.trim()) return;
    setEndpoints({ ...endpoints, [newName.trim()]: newPath.trim() });
    setNewName('');
    setNewPath('');
  };

  const handleRemove = (name: string) => {
    const next = { ...endpoints };
    delete next[name];
    setEndpoints(next);
  };

  return (
    <section className="mb-8">
      <h2 className="font-heading text-xl font-semibold mb-4">同步端点</h2>
      <div className="space-y-2 mb-4">
        {Object.entries(endpoints).map(([name, p]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="w-32 font-medium">{name}</span>
            <input
              value={p}
              onChange={(e) => setEndpoints({ ...endpoints, [name]: e.target.value })}
              className="flex-1 px-3 py-2 border border-divider rounded-lg text-sm"
            />
            <button onClick={() => handleRemove(name)} className="text-red-500 hover:text-red-700" aria-label={`删除 ${name}`}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="端名（如 opencode）"
          className="w-40 px-3 py-2 border border-divider rounded-lg text-sm"
        />
        <input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder="端路径（如 ~/.claude/skills）"
          className="flex-1 px-3 py-2 border border-divider rounded-lg text-sm"
        />
        <button onClick={handleAdd} className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-divider rounded-lg">
          <Plus size={16} /> 添加
        </button>
      </div>
      <button onClick={handleSave} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg">
        <Save size={16} /> 保存端点
      </button>
    </section>
  );
}
```

Modify `src/app/settings/page.tsx`：在文件末尾 `</main>` 前（现有表单区块之后）插入：

```tsx
<EndpointSettings />
```

并在文件顶部 imports 增加：`import { EndpointSettings } from '@/components/sync/EndpointSettings';`

- [ ] **Step 5: TopNav 增加 SYNC**

Modify `src/components/layout/TopNav.tsx` 的 `navItems`，在 AGENTS 之后插入：

```typescript
{ href: '/sync', label: 'SYNC', testId: 'nav-sync' },
```

- [ ] **Step 6: lint / tsc / 手工冒烟**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run lint && npx tsc --noEmit`
Expected: 无错误

手工冒烟：`npm run dev` 后浏览器访问 `http://localhost:3000/sync`，确认状态面板、collect/push 按钮、冲突列表渲染正常；`/settings` 页出现「同步端点」区块。

- [ ] **Step 7: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add src/app/sync src/components/sync src/components/layout/TopNav.tsx src/app/settings/page.tsx && git commit -m "feat: 同步页与设置页端点配置 UI"
```

---

### Task 11: e2e 同步测试（隔离环境）

**Files:**
- Create: `e2e/global-setup.ts`
- Create: `e2e/tests/08-sync.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: Task 9 API、Task 10 UI（h1 `Skill Sync`、按钮 `collect`/`push`）
- Produces: `npm run test:e2e` 覆盖同步流程；dev server 以 `AIHOME_REPO_DIR`/`AIHOME_CONFIG_DIR` 指向 `e2e/.e2e-sync/` 隔离真实 home

- [ ] **Step 1: 写 global-setup 生成隔离夹具**

Create `e2e/global-setup.ts`：

```typescript
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');
const syncRoot = path.join(root, 'e2e', '.e2e-sync');

export default function globalSetup(): void {
  fs.rmSync(syncRoot, { recursive: true, force: true });
  const alpha = path.join(syncRoot, 'alpha');
  const beta = path.join(syncRoot, 'beta');
  const repo = path.join(syncRoot, 'repo');
  const config = path.join(syncRoot, 'config');

  fs.mkdirSync(path.join(alpha, 'foo'), { recursive: true });
  fs.writeFileSync(path.join(alpha, 'foo', 'SKILL.md'), '---\ndescription: foo\n---\n\nv1\n');
  fs.mkdirSync(path.join(beta, 'foo'), { recursive: true });
  fs.writeFileSync(path.join(beta, 'foo', 'SKILL.md'), '---\ndescription: foo\n---\n\nv2-different\n');
  fs.mkdirSync(path.join(beta, 'bar'), { recursive: true });
  fs.writeFileSync(path.join(beta, 'bar', 'SKILL.md'), '---\ndescription: bar\n---\n\nunique\n');

  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(
    path.join(config, 'sync-config.json'),
    JSON.stringify({ version: 1, endpoints: { alpha, beta } }, null, 2)
  );
  fs.mkdirSync(repo, { recursive: true });
}
```

- [ ] **Step 2: 改 playwright.config.ts**

Modify `playwright.config.ts`：顶部加 `import * as path from 'path';` 与 `const e2eSyncRoot = path.join(__dirname, 'e2e', '.e2e-sync');`；顶层加 `globalSetup: './e2e/global-setup.ts',`；`webServer` 加 `env`：

```typescript
  globalSetup: './e2e/global-setup.ts',

  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      AIHOME_REPO_DIR: path.join(e2eSyncRoot, 'repo'),
      AIHOME_CONFIG_DIR: path.join(e2eSyncRoot, 'config'),
    },
  },
```

- [ ] **Step 3: 写 08-sync.spec.ts**

Create `e2e/tests/08-sync.spec.ts`：

```typescript
import { test, expect } from '@playwright/test';

test.describe('Skill Sync', () => {
  test('isolation guard: dev server must use .e2e-sync dirs', async ({ request }) => {
    const res = await request.get('/api/sync/status');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const alphaPath: string = data.state.endpoints.alpha?.path ?? '';
    expect(alphaPath).toContain('.e2e-sync');
  });

  test('sync page shows endpoint status', async ({ page }) => {
    await page.goto('/sync');
    await expect(page.locator('main h1')).toContainText('Skill Sync');
    await expect(page.locator('main section').filter({ hasText: 'alpha' }).first()).toBeVisible();
    await expect(page.locator('main section').filter({ hasText: 'beta' }).first()).toBeVisible();
  });

  test('collect pulls skills and records the conflict', async ({ page, request }) => {
    await page.goto('/sync');
    await page.locator('button', { hasText: 'collect' }).click();
    await expect(page.locator('text=冲突').first()).toBeVisible();

    const conflicts = await (await request.get('/api/sync/conflicts')).json();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].name).toBe('foo');
    expect(conflicts[0].versions).toContain('common/foo@beta');

    const status = await (await request.get('/api/sync/status')).json();
    expect(status.state.summary.total_skills).toBe(2);
    expect(status.state.summary.conflict_count).toBe(1);
  });

  test('push installs non-conflicting skills, keeps conflict copies', async ({ page, request }) => {
    await page.goto('/sync');
    await page.locator('button', { hasText: 'push' }).click();

    const status = await (await request.get('/api/sync/status')).json();
    // bar（无冲突）应已装到 alpha/beta；foo（冲突标记）不动
    expect(status.state.endpoints.beta.diff.same).toBe(1);      // bar
    expect(status.state.endpoints.beta.diff.different).toBe(1); // foo 冲突副本保留
    expect(status.state.endpoints.alpha.diff.same).toBe(2);     // foo + bar
    expect(status.state.endpoints.alpha.diff.missing).toBe(0);
  });
});
```

- [ ] **Step 4: 跑 e2e**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test:e2e`
Expected: 全绿（含既有 91 个用例）。若本机已有 dev server 在跑（reuseExistingServer），隔离守卫会失败——先停掉再跑。

- [ ] **Step 5: Commit**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add e2e/global-setup.ts e2e/tests/08-sync.spec.ts playwright.config.ts && git commit -m "test: 同步流程 e2e（隔离夹具）"
```

---

### Task 12: 冻结 skill-sync 仓库

**Files:**
- Modify: `/Users/gstar/skill-sync/README.md`（仓库外）

- [ ] **Step 1: README 顶部加合并声明**

Modify `/Users/gstar/skill-sync/README.md`，在标题行 `# skill-sync` 之后插入：

```markdown
> **已合并入 [AIHome](https://github.com/Justin-Ju-0413/aihome)**（2026-08-05）：本仓库冻结，不再发布新版本。
> 技能同步（collect/push/冲突管理）已并入 AIHome 工作台，数据自动迁移至 `~/.aihome/repo`。
> 已发布的 v0.1.0 三平台桌面版仍可使用，但建议改用 AIHome。
```

- [ ] **Step 2: 提交并推送**

```bash
cd /Users/gstar/skill-sync && git add README.md && git commit -m "docs: 冻结仓库，功能并入 AIHome" && git push origin master
```

- [ ] **Step 3: GitHub 仓库归档（人工确认）**

到 https://github.com/Justin-Ju-0413/skill-sync/settings 选择 Archive this repository（可选，建议归档避免误发版）。此项需用户手动操作或确认后由用户执行。

---

### Task 13: 最终验收

**Files:** 无新增

- [ ] **Step 1: 全量质量门**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run lint && npx tsc --noEmit && npm run build`
Expected: 全部通过

- [ ] **Step 2: 单测**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test`
Expected: 全部通过（约 30+ 用例）

- [ ] **Step 3: e2e**

Run: `cd /Users/gstar/Documents/05-项目代码/AIHome && npm run test:e2e`
Expected: 全绿（91 既有 + 4 新）

- [ ] **Step 4: 真实机器冒烟（含迁移）**

Run（本机有旧 `~/skill-sync`，真实默认目录）:
```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && npm run dev >/tmp/aihome-final-smoke.log 2>&1 &
sleep 10
curl -s http://localhost:3000/api/sync/status | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('legacy:', d['legacy'])
print('summary:', d['state']['summary'])
print('endpoints:', sorted(d['state']['endpoints']))
"
kill %1
```
Expected: `legacy.present == true`（本机存在 ~/skill-sync）；迁移后 `legacy.migrated == true`、`copiedSkills == 73`；`summary.total_skills == 73`、`conflict_count == 1`、`endpoint_count == 4`；且 `~/.aihome/repo/common/` 下技能数与旧仓库一致。核对后可在 UI 里点一次 collect/push 走真实全流程。

- [ ] **Step 5: 更新计划勾选并提交计划文档**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome && git add docs/superpowers/plans/2026-08-05-aihome-sync-merge.md && git commit -m "docs: M1 同步核心并入计划完成"
```
