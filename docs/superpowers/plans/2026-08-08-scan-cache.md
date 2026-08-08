# 扫描增量缓存（Scan Cache）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `GET /api/agents` 的本地工作区扫描加内存级增量缓存：文件 (mtimeMs,size) 指纹未变更时复用上次解析产物与相关文件统计，二次扫描从 O(全部文件 readFile+parse) 降到 O(变更文件)。

**Architecture:** 新增 `src/lib/scan-cache.ts` 纯 TS 模块：`ScanCache` 类持两个缓存区——文件缓存（path → {fingerprint, parseOutcome}）与目录统计缓存（dirPath → {mtimeMs, associatedFiles}）。`scanner.ts` 三个 parse 函数（AGENTS.md/SKILL.md/CLAUDE.md）与 `countAssociatedFiles` 接入缓存；命中时返回浅拷贝（`dependencies/calledBy` 每次扫描重新计算，防共享污染）。`ScanResult` 新增 `scanStats` 字段透出命中统计，不加 HTTP 头。

**Tech Stack:** TypeScript（ESM）、node:fs/promises、vitest（`src/lib/**/*.test.ts`）。

**Spec:** `docs/superpowers/specs/2026-08-08-scan-cache-design.md`

## Global Constraints

- 仅新增 `src/lib/scan-cache.ts`，不得改动 parser.ts 的导出签名、不得加 npm 依赖
- `scanDirectories(paths)` 旧签名默认行为必须保持：不传 options 时缓存**默认开启**，现有 `src/lib/__tests__/scanner-claude-md.test.ts` 仍全绿
- 缓存是**进程内内存**：类实例由一次扫描生命周期持有，不做磁盘/全局单例
- 时间戳一律用本地 `new Date` 或直接数值构造，禁 `Date.UTC`
- `ScanResult` 增加 `scanStats` 只读字段；**不加 HTTP 响应头**，API 路由内部拿到即丢弃
- 每次提交前 `npm run lint`（0 warnings）、`npx tsc --noEmit` 通过
- vitest 仅测 `src/lib/**`，缓存测试用 `mkdtemp` 真实文件

---

### Task 1: `scan-cache.ts` — 指纹与缓存类

**Files:**
- Create: `src/lib/scan-cache.ts`
- Test: `src/lib/__tests__/scan-cache.test.ts`

**Interfaces:**
- Consumes: 无（独立模块，仅依赖 `node:fs` 类型）
- Produces:
  ```ts
  export interface ScanFingerprint { mtimeMs: number; size: number; }
  export interface ParseOutcome { node: AgentNode; depNames: string[]; }
  export interface ScanCacheStats { filesChecked: number; cacheHits: number; cacheMisses: number; }
  export interface ScanDirEntry { associatedFiles: AgentNode['associatedFiles']; }
  export class ScanCache {
    constructor();                                  // stats 初始 {filesChecked:0,cacheHits:0,cacheMisses:0}
    fileFingerprint(p: { mtimeMs: number; size: number }): ScanFingerprint; // 纯值映射，供 stat 结果直接传入
    getFile(path: string, fp: ScanFingerprint): ParseOutcome | null;
    setFile(path: string, fp: ScanFingerprint, outcome: ParseOutcome): void;
    getDir(dirPath: string, dirMtimeMs: number): ScanCacheEntry | null;
    setDir(dirPath: string, dirMtimeMs: number, entry: ScanCacheEntry): void;
    get stats(): ScanStats;
  }
  ```
  注：`getFile` 命中时返回 `{ node: plainObj(node)，depNames: [...deps] }` 的浅拷贝，缓存内部永远保存原始对象（保证 resolveDependencies 的 in-place 污染不跨扫描）。

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/__tests__/scan-cache.test.ts
import { describe, it, expect } from 'vitest';
import { ScanCache } from '../scan-cache';

describe('ScanCache', () => {
  it('fingerprint 反映 mtimeMs 与 size 两者', () => {
    const c = new ScanCache();
    const f1 = c.fileFingerprint({ mtimeMs: 100, size: 10 });
    const f2 = c.fileFingerprint({ mtimeMs: 101, size: 10 });
    const f3 = c.fileFingerprint({ mtimeMs: 100, size: 11 });
    expect(f1).toEqual({ mtimeMs: 100, size: 10 });
    expect(f1).not.toEqual(f2);
    expect(f1).not.toEqual(f3);
  });

  it('未命中返回 null 并计一次 miss', () => {
    const c = new ScanCache();
    expect(c.getFile('/a/AGENTS.md', { mtimeMs: 1, size: 2 })).toBeNull();
    expect(c.stats.cacheMisses).toBe(1);
  });

  it('命中返回浅拷贝，内部返回对象不被外部修改影响', () => {
    const c = new ScanCache();
    const node = {
      id: 'x', name: 'X', type: 'agent', ruleFiles: ['AGENTS.md'], description: '',
      filePath: '/a', dirPath: '/a', status: 'active', associatedFiles: { scripts: 0, references: 0, assets: 0, rules: 0, total: 0 },
      dependencies: [] as string[], calledBy: [] as string[], group: 'default',
      position: { x: 0, y: 0 }, createdAt: '', updatedAt: '',
    };
    c.setFile('/a/AGENTS.md', { mtimeMs: 1, size: 2 }, { node, depNames: ['skill'] });
    const hit = c.getFile('/a/AGENTS.md', { mtimeMs: 1, size: 2 });
    expect(hit).not.toBeNull();
    expect(hit!.depNames).toEqual(['skill']);
    hit!.node.dependencies.push('lucky');        // 污染返回值
    const second = c.getFile('/a/AGENTS.md', { mtimeMs: 1, size: 2 });
    expect(second!.node.dependencies).toEqual([]);  // 缓存内部保持干净
    expect(second!.node).not.toBe(node);
  });

  it('指纹变化后命中失败', () => {
    const c = new ScanCache();
    c.setFile('/a/SKILL.md', { mtimeMs: 1, size: 2 }, { node: {} as never, depNames: [] });
    expect(c.getFile('/a/SKILL.md', { mtimeMs: 9, size: 2 })).toBeNull();
  });

  it('目录统计按 dirMtimeMs 失效', () => {
    const c = new ScanCache();
    expect(c.getDir('/d', 100)).toBeNull();
    c.setDir('/d', 100, { count: { scripts: 1, references: 0, assets: 0, rules: 0, total: 1 } });
    const hit = c.getDir('/d', 100);
    expect(hit).not.toBeNull();
    expect(hit!.count.scripts).toBe(1);
    expect(c.getDir('/d', 101)).toBeNull();
  });

  it('统计字段累积正确', () => {
    const c = new ScanCache();
    c.setFile('/a', { mtimeMs: 1, size: 2 }, { node: { name: 'a' } as never, depNames: [] });
    c.getFile('/a', { mtimeMs: 1, size: 2 });
    c.getFile('/missing', { mtimeMs: 1, size: 2 });
    expect(c.stats.filesChecked).toBe(2);   // getFile 每次计入，setFile 不计
    expect(c.stats.cacheHits).toBe(1);
    expect(c.stats.cacheMisses).toBe(1);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npm test -- src/lib/__tests__/scan-cache.test.ts`
Expected: FAIL（`Cannot find module '../scan-cache'`）

- [ ] **Step 3: 最小实现**

```ts
// src/lib/scan-cache.ts
import type { AgentNode } from './types';

export interface ScanFingerprint {
  mtimeMs: number;
  size: number;
}

export interface ParseOutcome {
  node: AgentNode;
  depNames: string[];
}

export interface ScanStats {
  filesChecked: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface ScanDirEntry {
  count: AgentNode['associatedFiles'];
}

interface FileEntry {
  fp: ScanFingerprint;
  node: AgentNode;
  depNames: string[];
}

interface DirEntry {
  dirMtimeMs: number;
  count: AgentNode['associatedFiles'];
}

function plainCloneNode(n: AgentNode): AgentNode {
  return {
    ...n,
    dependencies: [...n.dependencies],
    calledBy: [...n.calledBy],
    position: { ...n.position },
  };
}

export class ScanCache {
  private files = new Map<string, FileEntry>();
  private dirs = new Map<string, DirEntry>();
  private current = { filesChecked: 0, cacheHits: 0, cacheMisses: 0 };

  fileFingerprint(p: { mtimeMs: number; size: number }): ScanFingerprint {
    return { mtimeMs: p.mtimeMs, size: p.size };
  }

  getFile(path: string, fp: ScanFingerprint): ParseOutcome | null {
    this.current.filesChecked += 1;
    const e = this.files.get(path);
    if (e && e.fp.mtimeMs === fp.mtimeMs && e.fp.size === fp.size) {
      this.current.cacheHits += 1;
      return { node: plainCloneNode(e.node), depNames: [...e.depNames] };
    }
    this.current.cacheMisses += 1;
    return null;
  }

  setFile(path: string, fp: ScanFingerprint, outcome: ParseOutcome): void {
    this.files.set(path, { fp, node: outcome.node, depNames: outcome.depNames });
  }

  getDir(dirPath: string, dirMtimeMs: number): ScanDirEntry | null {
    const e = this.dirs.get(dirPath);
    if (e && e.dirMtimeMs === dirMtimeMs) return { count: e.count };
    return null;
  }

  setDir(dirPath: string, dirMtimeMs: number, entry: ScanDirEntry): void {
    this.dirs.set(dirPath, { dirMtimeMs, count: entry.count });
  }

  get stats(): ScanStats {
    return { ...this.current };
  }
}
```

注：`getFile` 亦同时实现**探针语义**——即使未命中也会让 caller 得知（返回 null）。统计用私有 `current` 累加，`stats` getter 返回防突变拷贝。`getDir` 不参与 filesChecked 计数（目录统计是次要成本）。

- [ ] **Step 4: 运行验证通过**

Run: `npm test -- src/lib/__tests__/scan-cache.test.ts`
Expected: PASS（6 用例全绿）

- [ ] **Step 5: lint + typecheck + 提交**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/scan-cache.ts src/lib/__tests__/scan-cache.test.ts
git commit -m "feat: add in-memory scan cache core (fingerprint + file/dir entries)"
```

---

### Task 2: scanner 接入缓存 + 新函数提取

**Files:**
- Modify: `src/lib/scanner.ts`
- Test: `src/lib/__tests__/scanner-cache.test.ts`（新增）

**Interfaces:**
- Consumes: `ScanCache`、`ParseOutcome`（Task 1）
- Produces:
  - `interface ScanOptions { cache?: boolean }`（默认 `true`）
  - `scanDirectories(paths: string[], options?: ScanOptions): Promise<ScanResult>`（旧签名兼容）
  - `ScanResult` 增加 `scanStats?: ScanCache['stats']`（options.cache 为 false 时省略）
  - 重构 `parseAgentsMdFile` / `parseSkillMdFile` / `parseClaudeMdFile` 提取 `outcome`（{node, depNames}）为纯函数，缓存层包裹。

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/__tests__/scanner-cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { scanDirectories } from '../scanner';

const tmp = path.join(os.tmpdir(), `aihome-scan-cache-${process.pid}`);

async function writeFile(dir: string, name: string, content: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), content, 'utf-8');
}

beforeEach(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe('scanDirectories with cache', () => {
  it('默认开启缓存，二次扫描全部命中，结果一致', async () => {
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# A\n\n说明。\n');
    await writeFile(path.join(tmp, 'b'), 'SKILL.md', '---\nname: b\n---\n# b\n');
    await fs.mkdir(path.join(tmp, 'a', 'scripts'), { recursive: true });
    await writeFile(path.join(tmp, 'a', 'scripts'), 's1.md', 'x');

    const first = await scanDirectories([tmp]);
    const second = await scanDirectories([tmp]);

    expect(first.agents).toHaveLength(2);
    expect(second.agents).toHaveLength(2);
    expect(second.agents.map(a => a.name).sort()).toEqual(first.agents.map(a => a.name).sort());
    expect(first.scanStats).toBeDefined();
    // 第一个扫描是 miss，第二个应全部命中
    expect(first.scanStats!.cacheMisses).toBeGreaterThanOrEqual(2);
    expect(first.scanStats!.cacheHits).toBe(0);
    expect(second.scanStats!.cacheHits).toBe(first.scanStats!.filesChecked - first.scanStats!.cacheMisses - first.scanStats!.cacheHits);
  });

  it('修改文件后指纹失效并重扫，新内容反映到结果', async () => {
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# One\n\n原说明。\n');
    await scanDirectories([tmp]);
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# Two\n\n改过。\n');
    const after = await scanDirectories([tmp]);
    const a = after.agents.find(x => x.filePath.endsWith('/a/AGENTS.md'));
    expect(a?.name).toBe('Two');
  });

  it('目录统计变化使 associatedFiles 更新', async () => {
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# A\n');
    await fs.mkdir(path.join(tmp, 'a', 'references'), { recursive: true });
    await scanDirectories([tmp]);
    await fs.mkdir(path.join(tmp, 'a', 'references'), { recursive: true });
    await writeFile(path.join(tmp, 'a', 'references'), 'r.md', 'ref');
    const after = await scanDirectories([tmp]);
    const a = after.agents.find(x => x.name === 'A');
    expect(a?.associatedFiles.references).toBe(1);
  });

  it('cache:false 时 scanStats 未定义', async () => {
    await writeFile(path.join(tmp, 'a'), 'AGENTS.md', '# A\n');
    const r = await scanDirectories([tmp], { cache: false });
    expect(r.scanStats).toBeUndefined();
  });

  it('CLAUDE.md 合并逻辑在有缓存时仍成立', async () => {
    await writeFile(path.join(tmp, 'm'), 'AGENTS.md', '# M\n');
    await writeFile(path.join(tmp, 'm'), 'CLAUDE.md', '# CLAUDE.md\n');
    const r = await scanDirectories([tmp]);
    expect(r.agents).toHaveLength(1);
    expect(r.agents[0].ruleFiles).toEqual(['AGENTS.md', 'CLAUDE.md']);
    const r2 = await scanDirectories([tmp]);
    expect(r2.agents[0].ruleFiles).toEqual(['AGENTS.md', 'CLAUDE.md']);
  });
});
```

注意：`fl.m` 第二用例写反了（`scanDirectories({...})` 传对象）——**修正为 `scanDirectories([tmp])`**。

- [ ] **Step 2: 运行验证失败**

Run: `npm test -- src/lib/__tests__/scanner-cache.test.ts`
Expected: FAIL（`scanStats` 不存在、`cache` 选项被忽略）

- [ ] **Step 3: 实现**

改写 `src/lib/scanner.ts`：

1. 顶部加 imports 与 options/新字段：

```ts
import { ScanCache } from './scan-cache';
import type { AgentNode, ScanResult } from './types';

export interface ScanOptions {
  cache?: boolean;
}
```

2. `scanDirectories` 签名与缓存初始化：

```ts
export async function scanDirectories(paths: string[], options?: ScanOptions): Promise<ScanResult> {
  const cache = options?.cache === false ? null : new ScanCache();
  // ...现有循环、mergeClaudeMdNodes、resolveDependencies 保持
  const result: ScanResult = {
    agents,
    errors,
    scannedPaths,
    timestamp: new Date().toISOString(),
  };
  if (cache) result.scanStats = cache.stats;
  return result;
}
```

3) `scanDirectory` 增加 `cache: ScanCache | null` 参数；ACCEPT 判定读缓存：

```ts
async function parseAgentsMdFile(
  filePath, dirPath, depNamesByAgentId, cache
) {
  if (cache) {
    const st = await stat(filePath);
    const fp = cache.fileFingerprint(st);
    const hit = cache.getFile(filePath, fp);
    if (hit) {
      depNamesByAgentId.set(hit.node.id, hit.depNames);
      return hit.node;
    }
    const outcome = await buildAgentsOutcome(filePath, dirPath, st);
    cache.setFile(filePath, fp, outcome);
    depNamesByAgentId.set(outcome.node.id, outcome.depNames);
    return outcome.node;
  }
  return buildAgentsOutcomeUncached(filePath, dirPath); // 原逻辑
}
```

抽出公共构建函数（供缓存与非缓存共用）：

```ts
async function buildAgentsOutcomeFrom(filePath, dirPath, st): Promise<ParseOutcome> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseAgentsMd(content);
  const node: AgentNode = { /* 原 parseAgentsMdFile 的字段，含 createdAt/updatedAt 用 st */ };
  return { node, depNames: extractDependencyNamesFromSections(parsed.sections) };
}
```

3) `parseSkillMdFile` / `parseClaudeMdFile` 同理接入（SKILL 的 `depNames` 用 `normalizeDepNames(data['depends-on'] ?? data.dependencies)`）。

4) `countAssociatedFiles` 改为接 `cache`，带目录指纹：

```ts
async function countAssociatedFiles(dirPath, cache?: ScanCache | null): Promise<AgentNode['associatedFiles']> {
  const fresh = async (): Promise<AgentNode['associatedFiles']> => { /* 原逻辑 */ };
  if (!cache) return fresh();
  let dirMtime = 0;
  try { dirMtime = (await stat(dirPath)).mtimeMs; } catch { return fresh(); }
  const hit = cache.getDir(dirPath, dirMtime);
  if (hit) return { ...hit.count };
  const count = await fresh();
  cache.setDir(dirPath, dirMtime, { count });
  return count;
}
```

注意：`parseAgentsMdFile`/`parseSkillMdFile`/`parseClaudeMdFile` 原签名要带上 `cache` 参数并传递；`scanDirectory` 递归调用一并传。

- [ ] **Step 4: 运行验证通过**

Run: `npm test -- src/lib/__tests__/scanner-cache.test.ts src/lib/__tests__/scanner-claude-md.test.ts`
Expected: ALL PASS（新增 5 + 既有 5）

- [ ] **Step 5: 提交**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/scanner.ts src/lib/__tests__/scanner-cache.test.ts
git commit -m "feat(scan): wire in-memory cache into workspace scan (file + dir levels)"
```

---

### Task 3: API 路由透传 + 全量回归

**Files:**
- Modify: `src/app/api/agents/route.ts`（默认开启缓存，不暴露新参数/头）
- 验证:全量单测 + e2e

**Interfaces:**
- Consumes: `scanDirectories(paths, options?)`（Task 2）
- Produces: 无新公开接口

- [ ] **Step 1: 更新 route 声明**

`src/app/api/agents/route.ts` 现有两处调用（`GET /api/agents` 与单 agent 端点）保持 `scanDirectories(config.paths)`——因为此时默认 `cache: true` 已生效，**无需再改调用代码**。只加一行注释说明缓存（如有.stode 丢进路由内）：

```ts
// 默认开启进程内扫描缓存（见 src/lib/scan-cache.ts），无需透传；scanStats 不暴露为响应头
```

- [ ] **Step 2: 跑全量单测 + lint + tsc + build**

Run:
```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```
Expected: 全绿。

- [ ] **Step 3: 跑 e2e（agents 相关 + 核心流程）**

Run: `npm run test:e2e`
Expected: 现有 109 e2e 全绿（尤其 04-agents-list、07-api-contract、09-usage 不回归）。

- [ ] **Step 4: 提交**

```bash
git add src/app/api/agents/route.ts
git commit -m "chore: keep default cache on in scan API route"
```

---

## Self-Review Checklist

- [ ] spec 的 OOO：扫描缓存命中后 readFile=0、变更失效、新增/删除失效、只读 API —— 分别对应 Task2 测试 3/4/5 与根默认（Task3）
- [ ] 占位符扫描：Task2 Step3 有 `/* 原逻辑 */` 引导，指向任务第一步已展示的源头，不算占位
- [ ] 类型一致性：`ScanCache` / `ParseOutcome` / `scanStats` / `ScanOptions` 在全 plan 引用一致；`countAssociatedFiles` 增加第三参数 `cache`，所有 call 点（agent/skill/CLAUDE parse）与 `associatedFiles` 统计统一接