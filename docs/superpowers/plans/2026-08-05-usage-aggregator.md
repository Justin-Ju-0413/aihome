# Usage 超级聚合体（TokenTicker 并入 AIHome）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AIHome 中新增 `/usage` 页面，把 TokenTicker 的 K 线/用量表格能力扩展为 CC Switch / Claude Code / Codex / opencode / hermes 五源聚合看板。

**Architecture:** 每源一个只读 adapter 解析本地文件 → 增量索引器清洗后写入缓存 SQLite（`.aihome/usage-cache.db`）→ API 层从缓存聚合 → `/usage` 页渲染总览/K线/图表/表格。页面查询全部走缓存，JSONL 只按 mtime 增量扫描。

**Tech Stack:** Next.js 16（App Router）、内置 `node:sqlite`（DatabaseSync，Node 22.13+，**不加任何 npm 依赖**）、React 19、Tailwind 4、Vitest、Playwright。K 线自绘 canvas，无图表库。

**Spec:** `docs/superpowers/specs/2026-08-05-usage-aggregator-design.md`

## Global Constraints

- Node ≥ 22.13（CI 用 22，本机 25）：SQLite 一律用内置 `node:sqlite` 的 `DatabaseSync`，同步 API，不加 native 依赖。
- 所有适配器**只读**源文件/DB；源路径硬编码白名单 + env 覆盖（仅测试用），不接受用户传入路径。
- 缓存 DB 只写 `configDir()/usage-cache.db`（`configDir()` 尊重 `AIHOME_CONFIG_DIR`，与 `src/lib/sync/paths.ts` 一致）。
- 单源失败隔离：adapter 抛错 → 该源标 `error`，绝不向 API 抛出。
- `UsageEvent.timestamp` 统一为 epoch **毫秒**；各源 checkpoint 存源原生单位（见各 task）。
- 代码不加注释（遵循项目风格）；严格 TS，`npm run lint` 零告警。
- E2E 环境变量：`AIHOME_USAGE_CCSWITCH_DB` / `AIHOME_USAGE_CLAUDE_DIR` / `AIHOME_USAGE_CODEX_DIR` / `AIHOME_USAGE_OPENCODE_DB` / `AIHOME_USAGE_HERMES_DB`（默认值见 Task 1 `paths.ts`）。
- 测试命令：`npm run test`（vitest）、`npm run lint`、`npm run test:e2e`。

---

### Task 1: 基础类型 + 路径解析（含 @types/node 升级）

**Files:**
- Create: `src/lib/usage/types.ts`
- Create: `src/lib/usage/paths.ts`
- Modify: `vitest.config.ts`（include 加 usage 测试）
- Modify: `package.json`（devDependencies `@types/node` `^20` → `^22`，需 `npm install`）

**Interfaces:**
- Produces: `UsageSource`, `ActiveUsageSource`, `UsageEvent`, `ScannedEvent`, `SourceStatus`, `SourceInfo`, `Checkpoint`；`USAGE_SOURCE_PATHS`, `usageCachePath()`。

- [ ] **Step 1: 写 types.ts**

```ts
export type UsageSource =
  | 'cc-switch' | 'claude' | 'codex' | 'opencode' | 'hermes' | 'openclaw';
export type ActiveUsageSource = Exclude<UsageSource, 'openclaw'>;

export const ACTIVE_SOURCES: ActiveUsageSource[] = [
  'cc-switch', 'claude', 'codex', 'opencode', 'hermes',
];

export interface UsageEvent {
  source: ActiveUsageSource;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  latencyMs?: number;
  sessionId?: string;
  timestamp: number;
}

export type ScannedEvent = UsageEvent & { rawId: string };

export interface Checkpoint {
  ts: number;
  mtime: number;
}

export const EMPTY_CHECKPOINT: Checkpoint = { ts: 0, mtime: 0 };

export type SourceStatus = 'ready' | 'unavailable' | 'error' | 'not-supported';

export interface SourceInfo {
  id: UsageSource;
  label: string;
  status: SourceStatus;
  message?: string;
  lastScanAt?: number;
  eventCount?: number;
}
```

- [ ] **Step 2: 写 paths.ts**

```ts
import * as os from 'os';
import * as path from 'path';
import { configDir } from '@/lib/sync/paths';
import type { ActiveUsageSource } from './types';

export const USAGE_SOURCE_PATHS: Record<ActiveUsageSource, () => string> = {
  'cc-switch': () =>
    process.env.AIHOME_USAGE_CCSWITCH_DB ?? path.join(os.homedir(), '.cc-switch', 'cc-switch.db'),
  claude: () =>
    process.env.AIHOME_USAGE_CLAUDE_DIR ?? path.join(os.homedir(), '.claude', 'projects'),
  codex: () =>
    process.env.AIHOME_USAGE_CODEX_DIR ?? path.join(os.homedir(), '.codex', 'sessions'),
  opencode: () =>
    process.env.AIHOME_USAGE_OPENCODE_DB ??
    path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db'),
  hermes: () =>
    process.env.AIHOME_USAGE_HERMES_DB ?? path.join(os.homedir(), '.hermes', 'state.db'),
};

export function usageCachePath(): string {
  return process.env.AIHOME_USAGE_CACHE ?? path.join(configDir(), 'usage-cache.db');
}
```

- [ ] **Step 3: 更新 vitest.config.ts 与 @types/node**

`vitest.config.ts` 的 `include` 改为：`['src/lib/sync/**/*.test.ts', 'src/lib/usage/**/*.test.ts']`。
`package.json` 中 `"@types/node": "^20"` 改为 `"^22"`，然后 `npm install`（node:sqlite 类型在 @types/node 22+）。

- [ ] **Step 4: 验证**

Run: `npm run lint && npx tsc --noEmit`
Expected: 无错误（types.ts/paths.ts 可被空引用，tsconfig 需能解析 `node:sqlite`——此处只验证依赖安装成功）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage/types.ts src/lib/usage/paths.ts vitest.config.ts package.json package-lock.json
git commit -m "feat(usage): add usage types, paths, and test config"
```

---

### Task 2: 定价表 pricing.ts

**Files:**
- Create: `src/lib/usage/pricing.ts`
- Test: `src/lib/usage/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: 无（独立模块）。
- Produces:
  - `interface ModelPricing { inputPerM; outputPerM; cacheReadPerM; cacheWritePerM }`（每百万 token 美元）
  - `BUNDLED_PRICING: Record<string, ModelPricing>`
  - `function calculateCost(u: { input; output; cacheRead; cacheWrite }, p: ModelPricing): number`
  - `function getPricing(model: string, ccSwitchPricing?: Record<string, ModelPricing> | null): ModelPricing | null`
  - `function loadCcSwitchPricing(dbPath: string): Record<string, ModelPricing> | null`

**定价公式**（每百万 token）：
`cost = (input - cacheRead - cacheWrite) * inputPerM + cacheRead * cacheReadPerM + cacheWrite * cacheWritePerM + output * outputPerM`，全部除以 1e6。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { calculateCost, getPricing, loadCcSwitchPricing } from '../pricing';
import type { ModelPricing } from '../pricing';

const p: ModelPricing = { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 };

describe('calculateCost', () => {
  it('computes cost with cache semantics', () => {
    expect(
      calculateCost({ input: 1000, output: 100, cacheRead: 200, cacheWrite: 50 }, p)
    ).toBeCloseTo((750 * 5 + 200 * 0.5 + 50 * 6.25 + 100 * 25) / 1e6, 10);
  });
});

describe('getPricing', () => {
  it('prefers cc-switch pricing over bundled', () => {
    const cc: Record<string, ModelPricing> = { 'glm-5.2': p };
    expect(getPricing('glm-5.2', cc)).toEqual(p);
  });
  it('falls back to bundled', () => {
    expect(getPricing('claude-sonnet-4-5', null)).not.toBeNull();
  });
  it('returns null for unknown model', () => {
    expect(getPricing('no-such-model', null)).toBeNull();
  });
});

describe('loadCcSwitchPricing', () => {
  it('returns null when db file missing', () => {
    expect(loadCcSwitchPricing('/nonexistent/db.sqlite')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/pricing.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 pricing.ts**

```ts
import { existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';

export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  cacheWritePerM: number;
}

export const BUNDLED_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-7': { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  'claude-sonnet-4-5': { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  'claude-3-7-sonnet-20250219': { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10, cacheReadPerM: 1.25, cacheWritePerM: 2.5 },
  'gpt-5.5': { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.1, cacheWritePerM: 1.25 },
  'gpt-5.6-terra': { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.1, cacheWritePerM: 1.25 },
  'deepseek-v4-flash-free': { inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 },
  'glm-5.2': { inputPerM: 0.6, outputPerM: 2.5, cacheReadPerM: 0.1, cacheWritePerM: 0.6 },
};

export function calculateCost(
  u: { input: number; output: number; cacheRead: number; cacheWrite: number },
  p: ModelPricing
): number {
  const input = Math.max(0, u.input - u.cacheRead - u.cacheWrite);
  return (
    input * p.inputPerM +
    u.cacheRead * p.cacheReadPerM +
    u.cacheWrite * p.cacheWritePerM +
    u.output * p.outputPerM
  ) / 1e6;
}

export function getPricing(
  model: string,
  ccSwitchPricing?: Record<string, ModelPricing> | null
): ModelPricing | null {
  return ccSwitchPricing?.[model] ?? BUNDLED_PRICING[model] ?? null;
}

export function loadCcSwitchPricing(dbPath: string): Record<string, ModelPricing> | null {
  if (!existsSync(dbPath)) return null;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT model_id, input_cost_per_million, output_cost_per_million,
                  cache_read_cost_per_million, cache_creation_cost_per_million
           FROM model_pricing`
        )
        .all() as Array<Record<string, unknown>>;
      const out: Record<string, ModelPricing> = {};
      for (const r of rows) {
        const input = Number(r.input_cost_per_million);
        const output = Number(r.output_cost_per_million);
        if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
        out[String(r.model_id)] = {
          inputPerM: input,
          outputPerM: output,
          cacheReadPerM: Number(r.cache_read_cost_per_million) || 0,
          cacheWritePerM: Number(r.cache_creation_cost_per_million) || 0,
        };
      }
      return out;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/pricing.test.ts`
Expected: PASS（3 组全过）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage/pricing.ts src/lib/usage/__tests__/pricing.test.ts
git commit -m "feat(usage): add pricing table and cost calculation"
```

---

### Task 3: 缓存 DB cache.ts

**Files:**
- Create: `src/lib/usage/cache.ts`
- Test: `src/lib/usage/__tests__/cache.test.ts`

**Interfaces:**
- Consumes: `ScannedEvent`, `Checkpoint`, `ActiveUsageSource`（Task 1）。
- Produces:
  - `class UsageCache`：
    - `static open(cachePath: string): UsageCache`（自动建目录、建表、迁移）
    - `insertEvents(events: ScannedEvent[]): void`（`(source, raw_id)` 主键去重，ON CONFLICT DO NOTHING）
    - `getCheckpoint(source: ActiveUsageSource): Checkpoint`
    - `setCheckpoint(source: ActiveUsageSource, cp: Checkpoint): void`
    - `queryEvents(sources: ActiveUsageSource[], sinceMs: number): ScannedEvent[]`
    - `countEvents(source: ActiveUsageSource): number`
    - `getMeta(key: string): string | null` / `setMeta(key: string, value: string): void`
    - `close(): void`

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS events (
  raw_id TEXT NOT NULL,
  source TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER,
  session_id TEXT,
  ts INTEGER NOT NULL,
  PRIMARY KEY (source, raw_id)
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(source, ts);
CREATE TABLE IF NOT EXISTS checkpoints (
  source TEXT PRIMARY KEY,
  ts INTEGER NOT NULL DEFAULT 0,
  mtime INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UsageCache } from '../cache';
import type { ScannedEvent, Checkpoint } from '../types';

let dir: string;
let cache: UsageCache;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-cache-'));
  cache = UsageCache.open(path.join(dir, 'cache.db'));
});

afterAll(() => {
  cache.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ev = (rawId: string, ts: number): ScannedEvent => ({
  rawId, source: 'cc-switch', provider: 'opencode', model: 'deepseek-v4-flash',
  inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1,
  costUsd: 0.001, timestamp: ts,
});

describe('UsageCache', () => {
  it('inserts events and dedupes by (source, raw_id)', () => {
    cache.insertEvents([ev('a', 1000), ev('b', 2000), ev('a', 3000)]);
    expect(cache.countEvents('cc-switch')).toBe(2);
  });
  it('stores and restores checkpoints', () => {
    const cp: Checkpoint = { ts: 42, mtime: 99 };
    cache.setCheckpoint('cc-switch', cp);
    expect(cache.getCheckpoint('cc-switch')).toEqual(cp);
    expect(cache.getCheckpoint('claude')).toEqual({ ts: 0, mtime: 0 });
  });
  it('queries events by time window', () => {
    const rows = cache.queryEvents(['cc-switch'], 1500);
    expect(rows.map((r) => r.rawId)).toEqual(['b']);
  });
  it('filters by source', () => {
    expect(cache.countEvents('claude')).toBe(0);
  });
  it('meta round-trip', () => {
    cache.setMeta('last_scan', '123');
    expect(cache.getMeta('last_scan')).toBe('123');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/cache.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 cache.ts**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { ActiveUsageSource, Checkpoint, ScannedEvent } from './types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  raw_id TEXT NOT NULL,
  source TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER,
  session_id TEXT,
  ts INTEGER NOT NULL,
  PRIMARY KEY (source, raw_id)
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(source, ts);
CREATE TABLE IF NOT EXISTS checkpoints (
  source TEXT PRIMARY KEY,
  ts INTEGER NOT NULL DEFAULT 0,
  mtime INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export class UsageCache {
  private constructor(private db: DatabaseSync) {}

  static open(cachePath: string): UsageCache {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const db = new DatabaseSync(cachePath);
    db.exec(SCHEMA);
    return new UsageCache(db);
  }

  insertEvents(events: ScannedEvent[]): void {
    if (events.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO events (raw_id, source, provider, model, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, session_id, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source, raw_id) DO NOTHING`
    );
    for (const e of events) {
      stmt.run(e.rawId, e.source, e.provider, e.model, e.inputTokens, e.outputTokens,
        e.cacheReadTokens, e.cacheWriteTokens, e.costUsd,
        e.latencyMs ?? null, e.sessionId ?? null, e.timestamp);
    }
  }

  getCheckpoint(source: ActiveUsageSource): Checkpoint {
    const row = this.db
      .prepare('SELECT ts, mtime FROM checkpoints WHERE source = ?')
      .get(source) as { ts: number; mtime: number } | undefined;
    return row ? { ts: row.ts, mtime: row.mtime } : { ts: 0, mtime: 0 };
  }

  setCheckpoint(source: ActiveUsageSource, cp: Checkpoint): void {
    this.db
      .prepare('INSERT OR REPLACE INTO checkpoints (source, ts, mtime) VALUES (?, ?, ?)')
      .run(source, cp.ts, cp.mtime);
  }

  queryEvents(sources: ActiveUsageSource[], sinceMs: number): ScannedEvent[] {
    if (sources.length === 0) return [];
    const placeholders = sources.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT raw_id, source, provider, model, input_tokens, output_tokens,
                cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, session_id, ts
         FROM events WHERE source IN (${placeholders}) AND ts >= ?
         ORDER BY ts`
      )
      .all(...sources, sinceMs) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      rawId: String(r.raw_id),
      source: r.source as ActiveUsageSource,
      provider: String(r.provider),
      model: String(r.model),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      cacheReadTokens: Number(r.cache_read_tokens),
      cacheWriteTokens: Number(r.cache_write_tokens),
      costUsd: Number(r.cost_usd),
      latencyMs: r.latency_ms == null ? undefined : Number(r.latency_ms),
      sessionId: r.session_id == null ? undefined : String(r.session_id),
      timestamp: Number(r.ts),
    }));
  }

  countEvents(source: ActiveUsageSource): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM events WHERE source = ?')
      .get(source) as { n: number };
    return Number(row.n);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/cache.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage/cache.ts src/lib/usage/__tests__/cache.test.ts
git commit -m "feat(usage): add incremental cache with checkpoint and dedupe"
```

---

### Task 4: CC Switch 适配器

**Files:**
- Create: `src/lib/usage/sources/ccswitch.ts`
- Test: `src/lib/usage/__tests__/ccswitch.test.ts`
- Test helper: `src/lib/usage/__tests__/fixtures.ts`（建 fixture SQLite/JSONL，供 Task 4–8 共用）

**Interfaces:**
- Consumes: `ScannedEvent`, `Checkpoint`, `EMPTY_CHECKPOINT`, `ActiveUsageSource`（Task 1）。
- Produces: `function scanCcSwitch(dbPath: string, cp: Checkpoint): { events: ScannedEvent[]; checkpoint: Checkpoint }`

**规则**（本机 `~/.cc-switch/cc-switch.db` 已验证）：
- `proxy_request_logs` 按 `created_at > cp.ts`（源单位：epoch **秒**）增量查询。
- 跳过 `status_code != 200` 的请求。
- 字段映射：`app_type`→provider、`model`→model、`input/output/cache_read/cache_creation_tokens`→tokens、`total_cost_usd`（TEXT）→`Number()`、`latency_ms`、`session_id`、`created_at*1000`→timestamp。
- `rawId = request_id`；新 checkpoint `{ ts: maxCreatedAt, mtime: 0 }`（无行则保持原 cp）。

- [ ] **Step 1: 写测试 helpers（fixtures.ts）**

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';

export function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function createSqlite(path: string, schema: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(schema);
  return db;
}

export function makeCcSwitchDb(p: string, rows: Array<Record<string, unknown>>): void {
  const db = new DatabaseSync(p);
  db.exec(
    `CREATE TABLE proxy_request_logs (
       request_id TEXT PRIMARY KEY, provider_id TEXT, app_type TEXT, model TEXT,
       input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
       cache_read_tokens INTEGER DEFAULT 0, cache_creation_tokens INTEGER DEFAULT 0,
       total_cost_usd TEXT DEFAULT '0', latency_ms INTEGER,
       session_id TEXT, status_code INTEGER, created_at INTEGER)`
  );
  const stmt = db.prepare(
    `INSERT INTO proxy_request_logs (request_id, provider_id, app_type, model,
       input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
       total_cost_usd, latency_ms, session_id, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    stmt.run(r.request_id, r.provider_id ?? 'p1', r.app_type, r.model, r.input_tokens ?? 0,
      r.output_tokens ?? 0, r.cache_read_tokens ?? 0, r.cache_creation_tokens ?? 0,
      r.total_cost_usd ?? '0', r.latency_ms ?? null, r.session_id ?? null,
      r.status_code ?? 200, r.created_at);
  }
  db.close();
}

export function rmTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
```

- [ ] **Step 2: 写失败测试**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import * as path from 'path';
import { scanCcSwitch } from '../sources/ccswitch';
import { tmpDir, makeCcSwitchDb, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';

const dir = tmpDir('ccswitch-');
afterAll(() => rmTmp(dir));

describe('scanCcSwitch', () => {
  it('reads 200 requests, skips failures, maps fields', () => {
    const dbPath = path.join(dir, 'cc.db');
    makeCcSwitchDb(dbPath, [
      { request_id: 'r1', app_type: 'opencode', model: 'deepseek-v4-flash', input_tokens: 100,
        output_tokens: 50, cache_read_tokens: 10, cache_creation_tokens: 5,
        total_cost_usd: '0.01', latency_ms: 300, session_id: 's1', status_code: 200,
        created_at: 1000 },
      { request_id: 'r2', app_type: 'opencode', model: 'deepseek-v4-flash', input_tokens: 1,
        output_tokens: 1, status_code: 500, created_at: 2000 },
    ]);
    const { events, checkpoint } = scanCcSwitch(dbPath, EMPTY_CHECKPOINT);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      rawId: 'r1', source: 'cc-switch', provider: 'opencode', model: 'deepseek-v4-flash',
      inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5,
      costUsd: 0.01, latencyMs: 300, sessionId: 's1', timestamp: 1_000_000,
    });
    expect(checkpoint.ts).toBe(2000);
  });
  it('incremental: only rows after checkpoint', () => {
    const dbPath = path.join(dir, 'cc2.db');
    makeCcSwitchDb(dbPath, [
      { request_id: 'a', app_type: 'x', model: 'm', created_at: 100 },
      { request_id: 'b', app_type: 'x', model: 'm', created_at: 200 },
    ]);
    const { events } = scanCcSwitch(dbPath, { ts: 150, mtime: 0 });
    expect(events.map((e) => e.rawId)).toEqual(['b']);
  });
  it('returns empty when file missing', () => {
    const { events, checkpoint } = scanCcSwitch(path.join(dir, 'nope.db'), EMPTY_CHECKPOINT);
    expect(events).toEqual([]);
    expect(checkpoint).toEqual(EMPTY_CHECKPOINT);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/ccswitch.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 ccswitch.ts**

```ts
import { existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import type { Checkpoint, ScannedEvent } from '../types';

export function scanCcSwitch(
  dbPath: string,
  cp: Checkpoint
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  if (!existsSync(dbPath)) return { events: [], checkpoint: cp };
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT request_id, app_type, model, input_tokens, output_tokens,
                  cache_read_tokens, cache_creation_tokens, total_cost_usd,
                  latency_ms, session_id, status_code, created_at
           FROM proxy_request_logs WHERE created_at > ? ORDER BY created_at`
        )
        .all(cp.ts) as Array<Record<string, unknown>>;
      const events: ScannedEvent[] = [];
      let maxTs = cp.ts;
      for (const r of rows) {
        if (Number(r.status_code) !== 200) continue;
        const created = Number(r.created_at);
        if (created > maxTs) maxTs = created;
        events.push({
          rawId: String(r.request_id),
          source: 'cc-switch',
          provider: String(r.app_type ?? 'unknown'),
          model: String(r.model ?? 'unknown'),
          inputTokens: Number(r.input_tokens) || 0,
          outputTokens: Number(r.output_tokens) || 0,
          cacheReadTokens: Number(r.cache_read_tokens) || 0,
          cacheWriteTokens: Number(r.cache_creation_tokens) || 0,
          costUsd: Number(r.total_cost_usd) || 0,
          latencyMs: r.latency_ms == null ? undefined : Number(r.latency_ms),
          sessionId: r.session_id == null ? undefined : String(r.session_id),
          timestamp: created * 1000,
        });
      }
      return { events, checkpoint: { ts: maxTs, mtime: 0 } };
    } finally {
      db.close();
    }
  } catch {
    return { events: [], checkpoint: cp };
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/ccswitch.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/usage/sources/ccswitch.ts src/lib/usage/__tests__/ccswitch.test.ts src/lib/usage/__tests__/fixtures.ts
git commit -m "feat(usage): add cc-switch adapter"
```

---

### Task 5: Claude Code 适配器

**Files:**
- Create: `src/lib/usage/sources/claude.ts`
- Test: `src/lib/usage/__tests__/claude.test.ts`

**Interfaces:**
- Consumes: `ScannedEvent`, `Checkpoint`, `getPricing`, `calculateCost`（Task 2），`fixtures.ts`（Task 4）。
- Produces: `function scanClaude(dir: string, cp: Checkpoint, pricingProvider: (model: string) => ModelPricing | null): { events: ScannedEvent[]; checkpoint: Checkpoint }`

**规则**（本机 `~/.claude/projects/**/*.jsonl` 已验证，两种格式都要兼容）：
- 递归找 `*.jsonl`，只扫 `mtimeMs > cp.mtime` 的文件。
- 每行 JSON：`type === 'assistant'` 且含 usage 才计。usage 取值：
  - 新格式：`d.message.usage`（`message` 为对象；`message` 也可能是字符串化的 JSON，需 `JSON.parse` 兜底）
  - 旧格式：`d.usage`（直接挂事件上）
- usage 字段：`input_tokens`、`output_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`。
- model：`d.message?.model ?? d.model`；timestamp：`Date.parse(d.timestamp)`（ISO，已验证）。
- cost = `calculateCost(usage, pricingProvider(model))`；无定价则 `costUsd = 0`。
- provider = `'claude-code'`；rawId = `<文件名>:<d.uuid>`（无 uuid 用行号）；新 checkpoint `{ ts: 0, mtime: maxScannedFileMtime }`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanClaude } from '../sources/claude';
import { tmpDir, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';
import { BUNDLED_PRICING } from '../pricing';

const dir = tmpDir('claude-');
afterAll(() => rmTmp(dir));

const NEW_FORMAT_LINE = JSON.stringify({
  type: 'assistant',
  uuid: 'u1',
  timestamp: '2026-08-01T10:00:00.000Z',
  message: {
    model: 'glm-5.2',
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: 300,
      cache_creation_input_tokens: 50,
    },
  },
});

const OLD_FORMAT_LINE = JSON.stringify({
  type: 'assistant',
  uuid: 'u2',
  timestamp: '2026-08-01T11:00:00.000Z',
  model: 'claude-sonnet-4-5',
  usage: { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

describe('scanClaude', () => {
  it('parses both new and old formats with pricing', () => {
    const sub = path.join(dir, 'proj');
    fs.mkdirSync(sub, { recursive: true });
    const f = path.join(sub, 's1.jsonl');
    fs.writeFileSync(f, `${NEW_FORMAT_LINE}\n${OLD_FORMAT_LINE}\nbroken-line\n`);
    const { events, checkpoint } = scanClaude(dir, EMPTY_CHECKPOINT, (m) => BUNDLED_PRICING[m] ?? null);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      rawId: 's1.jsonl:u1', source: 'claude', provider: 'claude-code', model: 'glm-5.2',
      inputTokens: 1000, outputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 50,
      timestamp: 1_782_504_000_000,
    });
    expect(events[0].costUsd).toBeGreaterThan(0);
    expect(events[1].model).toBe('claude-sonnet-4-5');
    expect(checkpoint.mtime).toBeGreaterThan(0);
  });
  it('mtime incremental: skips unmodified files', () => {
    const { events } = scanClaude(dir, { ts: 0, mtime: checkpointMtimeAfterFirstScan });
    expect(events).toHaveLength(0);
  });
  it('returns empty when dir missing', () => {
    const r = scanClaude(path.join(dir, 'nope'), EMPTY_CHECKPOINT, () => null);
    expect(r.events).toEqual([]);
  });
});
```

> 注：第二个用例中 `checkpointMtimeAfterFirstScan` 取第一个用例返回的 `checkpoint.mtime`（在测试文件顶部用 `let checkpointMtimeAfterFirstScan = 0;` 声明，第一个用例末尾赋值）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/claude.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 claude.ts**

```ts
import * as fs from 'fs';
import * as path from 'path';
import type { Checkpoint, ScannedEvent } from '../types';
import { calculateCost, type ModelPricing } from '../pricing';

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function findUsage(d: Record<string, unknown>): RawUsage | null {
  if (d.usage && typeof d.usage === 'object') return d.usage as RawUsage;
  const msg = d.message;
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const m = msg as Record<string, unknown>;
    if (m.usage && typeof m.usage === 'object') return m.usage as RawUsage;
  }
  if (typeof msg === 'string') {
    try {
      const parsed = JSON.parse(msg) as Record<string, unknown>;
      if (parsed.usage && typeof parsed.usage === 'object') return parsed.usage as RawUsage;
    } catch {
      return null;
    }
  }
  return null;
}

function collectJsonlFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export function scanClaude(
  dir: string,
  cp: Checkpoint,
  pricingProvider: (model: string) => ModelPricing | null
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  const events: ScannedEvent[] = [];
  let maxMtime = cp.mtime;
  for (const file of collectJsonlFiles(dir)) {
    const stat = fs.statSync(file);
    if (stat.mtimeMs <= cp.mtime) continue;
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return;
      }
      if (d.type !== 'assistant') return;
      const usage = findUsage(d);
      if (!usage) return;
      const model = String(
        (d.message && typeof d.message === 'object'
          ? (d.message as Record<string, unknown>).model
          : d.model) ?? 'unknown'
      );
      const pricing = pricingProvider(model);
      const input = Number(usage.input_tokens) || 0;
      const output = Number(usage.output_tokens) || 0;
      const cacheRead = Number(usage.cache_read_input_tokens) || 0;
      const cacheWrite = Number(usage.cache_creation_input_tokens) || 0;
      events.push({
        rawId: `${path.basename(file)}:${String(d.uuid ?? idx)}`,
        source: 'claude',
        provider: 'claude-code',
        model,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        costUsd: pricing ? calculateCost({ input, output, cacheRead, cacheWrite }, pricing) : 0,
        sessionId: d.sessionId == null ? undefined : String(d.sessionId),
        timestamp: Date.parse(String(d.timestamp)),
      });
    });
  }
  return { events, checkpoint: { ts: cp.ts, mtime: maxMtime } };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/claude.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage/sources/claude.ts src/lib/usage/__tests__/claude.test.ts
git commit -m "feat(usage): add claude-code jsonl adapter"
```

---

### Task 6: Codex 适配器

**Files:**
- Create: `src/lib/usage/sources/codex.ts`
- Test: `src/lib/usage/__tests__/codex.test.ts`

**Interfaces:**
- Consumes: `ScannedEvent`, `Checkpoint`, `calculateCost`/`getPricing`（Task 2），`fixtures.ts`。
- Produces: `function scanCodex(dir: string, cp: Checkpoint, pricingProvider: (model: string) => ModelPricing | null): { events: ScannedEvent[]; checkpoint: Checkpoint }`

**规则**（本机 `~/.codex/sessions/**/*.jsonl` 已验证）：
- 递归找 `*.jsonl`，只扫 `mtimeMs > cp.mtime`。
- 流式读行，维护 `currentModel`：
  - 事件 `payload.model` 存在时更新 `currentModel`（会话配置事件）。
- 对 `payload.type === 'token_count'` 且 `payload.info?.last_token_usage` 存在的事件，生成一条记录：
  - `input_tokens` / `cached_input_tokens`→cacheRead / `output_tokens`；`cacheWrite = 0`。
  - timestamp：顶层 `timestamp` 字段（可能是 ISO 字符串或 epoch ms，`Date.parse` 失败则 `Number`）。
  - cost = pricing（rollout 无 cost 字段，已验证）。
- provider = `'codex'`；rawId = `<文件名>:<事件 uuid/id 或行号>`；checkpoint.mtime = max 文件 mtime。
- 新版本 rollout `info: null` 自然跳过（无数据，诚实降级）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanCodex } from '../sources/codex';
import { tmpDir, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';
import { BUNDLED_PRICING } from '../pricing';

const dir = tmpDir('codex-');
afterAll(() => rmTmp(dir));

const configEvent = JSON.stringify({ type: 'event_msg', payload: { model: 'gpt-5.5' } });
const usageEvent = JSON.stringify({
  type: 'event_msg',
  timestamp: '2026-08-01T12:00:00.000Z',
  payload: {
    type: 'token_count',
    info: {
      last_token_usage: {
        input_tokens: 1000,
        cached_input_tokens: 200,
        output_tokens: 300,
        reasoning_output_tokens: 10,
      },
    },
  },
});
const emptyInfoEvent = JSON.stringify({
  type: 'event_msg',
  timestamp: '2026-08-01T12:05:00.000Z',
  payload: { type: 'token_count', info: null },
});

describe('scanCodex', () => {
  it('parses token_count usage and tracks model from config', () => {
    const sub = path.join(dir, '2026', '08');
    fs.mkdirSync(sub, { recursive: true });
    const f = path.join(sub, 'rollout-1.jsonl');
    fs.writeFileSync(f, `${configEvent}\n${usageEvent}\n${emptyInfoEvent}\nbad-json\n`);
    const { events, checkpoint } = scanCodex(dir, EMPTY_CHECKPOINT, (m) => BUNDLED_PRICING[m] ?? null);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      rawId: 'rollout-1.jsonl:1', source: 'codex', provider: 'codex', model: 'gpt-5.5',
      inputTokens: 1000, outputTokens: 300, cacheReadTokens: 200, cacheWriteTokens: 0,
      timestamp: 1_782_504_000_000,
    });
    expect(events[0].costUsd).toBeGreaterThan(0);
    expect(checkpoint.mtime).toBeGreaterThan(0);
  });
  it('skips files without usage data and missing dirs', () => {
    const { events } = scanCodex(path.join(dir, 'nope'), EMPTY_CHECKPOINT, () => null);
    expect(events).toEqual([]);
  });
});
```

> 注：rawId 用行号时，测试断言 `rollout-1.jsonl:1` 对应 usageEvent 所在行（第 2 行，0 起）。若实现用事件内 `id` 字段且 fixture 无 id，行号需与实现一致——实现中 rawId 用 `payload.id ?? 行号`，fixture 无 id 时即为行号。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/codex.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 codex.ts**

```ts
import * as fs from 'fs';
import * as path from 'path';
import type { Checkpoint, ScannedEvent } from '../types';
import { calculateCost, type ModelPricing } from '../pricing';

export function scanCodex(
  dir: string,
  cp: Checkpoint,
  pricingProvider: (model: string) => ModelPricing | null
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  const events: ScannedEvent[] = [];
  let maxMtime = cp.mtime;
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.jsonl')) scanFile(p);
    }
  };
  const scanFile = (file: string) => {
    const stat = fs.statSync(file);
    if (stat.mtimeMs <= cp.mtime) return;
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    let currentModel = 'unknown';
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return;
      }
      const payload = (d.payload ?? {}) as Record<string, unknown>;
      const model = payload.model;
      if (typeof model === 'string' && model) currentModel = model;
      if (payload.type !== 'token_count') return;
      const info = payload.info as
        | { last_token_usage?: Record<string, number> }
        | null
        | undefined;
      const usage = info?.last_token_usage;
      if (!usage) return;
      const input = Number(usage.input_tokens) || 0;
      const output = Number(usage.output_tokens) || 0;
      const cacheRead = Number(usage.cached_input_tokens) || 0;
      const pricing = pricingProvider(currentModel);
      const rawTs = d.timestamp;
      const parsed = typeof rawTs === 'string' ? Date.parse(rawTs) : NaN;
      const timestamp = Number.isFinite(parsed) ? parsed : Number(rawTs) || 0;
      events.push({
        rawId: `${path.basename(file)}:${String(d.id ?? idx)}`,
        source: 'codex',
        provider: 'codex',
        model: currentModel,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: 0,
        costUsd: pricing
          ? calculateCost({ input, output, cacheRead, cacheWrite: 0 }, pricing)
          : 0,
        sessionId: d.session_id == null ? undefined : String(d.session_id),
        timestamp,
      });
    });
  };
  walk(dir);
  return { events, checkpoint: { ts: cp.ts, mtime: maxMtime } };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/codex.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage/sources/codex.ts src/lib/usage/__tests__/codex.test.ts
git commit -m "feat(usage): add codex rollout adapter"
```

---

### Task 7: opencode 适配器

**Files:**
- Create: `src/lib/usage/sources/opencode.ts`
- Test: `src/lib/usage/__tests__/opencode.test.ts`

**Interfaces:**
- Consumes: `ScannedEvent`, `Checkpoint`, `fixtures.ts`。
- Produces: `function scanOpencode(dbPath: string, cp: Checkpoint): { events: ScannedEvent[]; checkpoint: Checkpoint }`

**规则**（本机 `opencode.db` 已验证）：
- `session` 表 `time_created > cp.ts`（epoch **毫秒**，源单位）增量。
- 每条会话一条事件：`cost`→costUsd、`tokens_input/output/reasoning`→tokens、`time_created`→timestamp。
- model：取该会话最早一条 message 的 `json_extract(data, '$.model.modelID')`（已验证 message.data JSON 含 `model.modelID`），无则 `'unknown'`。
- provider = `'opencode'`；rawId = session `id`；checkpoint.ts = max `time_created`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { scanOpencode } from '../sources/opencode';
import { tmpDir, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';

const dir = tmpDir('opencode-');
afterAll(() => rmTmp(dir));

function makeDb(p: string): void {
  const db = new DatabaseSync(p);
  db.exec(
    `CREATE TABLE session (
       id TEXT PRIMARY KEY, title TEXT, cost REAL NOT NULL DEFAULT 0,
       tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
       tokens_reasoning INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL) ;
     CREATE TABLE message (
       id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL,
       data TEXT NOT NULL)`
  );
  db.prepare(
    `INSERT INTO session (id, title, cost, tokens_input, tokens_output, tokens_reasoning, time_created)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('s1', 'task', 0.123, 1000, 500, 50, 1_782_504_000_000);
  db.prepare('INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)').run(
    'm1', 's1', 1_782_504_000_000,
    JSON.stringify({ model: { providerID: 'opencode', modelID: 'deepseek-v4-flash' } })
  );
  db.close();
}

describe('scanOpencode', () => {
  it('maps session rows with model from first message', () => {
    const dbPath = path.join(dir, 'oc.db');
    makeDb(dbPath);
    const { events, checkpoint } = scanOpencode(dbPath, EMPTY_CHECKPOINT);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      rawId: 's1', source: 'opencode', provider: 'opencode', model: 'deepseek-v4-flash',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0,
      costUsd: 0.123, timestamp: 1_782_504_000_000,
    });
    expect(checkpoint.ts).toBe(1_782_504_000_000);
  });
  it('incremental by time_created', () => {
    const dbPath = path.join(dir, 'oc2.db');
    makeDb(dbPath);
    const { events } = scanOpencode(dbPath, { ts: 1_782_504_000_000, mtime: 0 });
    expect(events).toEqual([]);
  });
  it('returns empty when file missing', () => {
    expect(scanOpencode(path.join(dir, 'nope.db'), EMPTY_CHECKPOINT).events).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/opencode.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 opencode.ts**

```ts
import { existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import type { Checkpoint, ScannedEvent } from '../types';

export function scanOpencode(
  dbPath: string,
  cp: Checkpoint
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  if (!existsSync(dbPath)) return { events: [], checkpoint: cp };
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT s.id, s.cost, s.tokens_input, s.tokens_output, s.tokens_reasoning, s.time_created,
                  (SELECT json_extract(data, '$.model.modelID') FROM message m
                   WHERE m.session_id = s.id ORDER BY m.time_created LIMIT 1) AS model
           FROM session s WHERE s.time_created > ? ORDER BY s.time_created`
        )
        .all(cp.ts) as Array<Record<string, unknown>>;
      const events: ScannedEvent[] = [];
      let maxTs = cp.ts;
      for (const r of rows) {
        const created = Number(r.time_created);
        if (created > maxTs) maxTs = created;
        events.push({
          rawId: String(r.id),
          source: 'opencode',
          provider: 'opencode',
          model: r.model == null || r.model === '' ? 'unknown' : String(r.model),
          inputTokens: Number(r.tokens_input) || 0,
          outputTokens: Number(r.tokens_output) || 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: Number(r.cost) || 0,
          sessionId: String(r.id),
          timestamp: created,
        });
      }
      return { events, checkpoint: { ts: maxTs, mtime: 0 } };
    } finally {
      db.close();
    }
  } catch {
    return { events: [], checkpoint: cp };
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/opencode.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage/sources/opencode.ts src/lib/usage/__tests__/opencode.test.ts
git commit -m "feat(usage): add opencode adapter"
```

---

### Task 8: hermes 适配器

**Files:**
- Create: `src/lib/usage/sources/hermes.ts`
- Test: `src/lib/usage/__tests__/hermes.test.ts`

**Interfaces:**
- Consumes: `ScannedEvent`, `Checkpoint`, `fixtures.ts`。
- Produces: `function scanHermes(dbPath: string, cp: Checkpoint): { events: ScannedEvent[]; checkpoint: Checkpoint }`

**规则**（本机 `~/.hermes/state.db` 已验证）：
- `sessions` 表 `started_at > cp.ts`（epoch **秒**，REAL，源单位）增量。
- cost = `estimated_cost_usd`（空/0 时用 `actual_cost_usd`）；token 列直映（`cache_write_tokens`→cacheWrite）；`source`→provider；`started_at*1000`→timestamp。
- rawId = `id`；checkpoint.ts = max `started_at`（保留小数原样，比较用 `> cp.ts` 即可）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { scanHermes } from '../sources/hermes';
import { tmpDir, rmTmp } from './fixtures';
import { EMPTY_CHECKPOINT } from '../types';

const dir = tmpDir('hermes-');
afterAll(() => rmTmp(dir));

function makeDb(p: string): void {
  const db = new DatabaseSync(p);
  db.exec(
    `CREATE TABLE sessions (
       id TEXT PRIMARY KEY, source TEXT, model TEXT, started_at REAL,
       input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
       cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
       estimated_cost_usd REAL, actual_cost_usd REAL)`
  );
  db.prepare(
    `INSERT INTO sessions (id, source, model, started_at, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, estimated_cost_usd, actual_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('h1', 'cli', 'qwen3.5-9b-optiq', 1780085816.60767, 100, 20, 5, 2, 0, 0.05);
  db.close();
}

describe('scanHermes', () => {
  it('maps session rows, falls back to actual cost', () => {
    const dbPath = path.join(dir, 'h.db');
    makeDb(dbPath);
    const { events, checkpoint } = scanHermes(dbPath, EMPTY_CHECKPOINT);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      rawId: 'h1', source: 'hermes', provider: 'cli', model: 'qwen3.5-9b-optiq',
      inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 2,
      costUsd: 0.05, timestamp: 1_780_085_816_607,
    });
    expect(checkpoint.ts).toBeGreaterThan(0);
  });
  it('returns empty when file missing', () => {
    expect(scanHermes(path.join(dir, 'nope.db'), EMPTY_CHECKPOINT).events).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/hermes.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 hermes.ts**

```ts
import { existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import type { Checkpoint, ScannedEvent } from '../types';

export function scanHermes(
  dbPath: string,
  cp: Checkpoint
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  if (!existsSync(dbPath)) return { events: [], checkpoint: cp };
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT id, source, model, started_at, input_tokens, output_tokens,
                  cache_read_tokens, cache_write_tokens, estimated_cost_usd, actual_cost_usd
           FROM sessions WHERE started_at > ? ORDER BY started_at`
        )
        .all(cp.ts) as Array<Record<string, unknown>>;
      const events: ScannedEvent[] = [];
      let maxTs = cp.ts;
      for (const r of rows) {
        const started = Number(r.started_at);
        if (started > maxTs) maxTs = started;
        const estimated = Number(r.estimated_cost_usd);
        const actual = Number(r.actual_cost_usd);
        events.push({
          rawId: String(r.id),
          source: 'hermes',
          provider: String(r.source ?? 'unknown'),
          model: String(r.model ?? 'unknown'),
          inputTokens: Number(r.input_tokens) || 0,
          outputTokens: Number(r.output_tokens) || 0,
          cacheReadTokens: Number(r.cache_read_tokens) || 0,
          cacheWriteTokens: Number(r.cache_write_tokens) || 0,
          costUsd: estimated > 0 ? estimated : actual > 0 ? actual : 0,
          sessionId: String(r.id),
          timestamp: Math.round(started * 1000),
        });
      }
      return { events, checkpoint: { ts: maxTs, mtime: 0 } };
    } finally {
      db.close();
    }
  } catch {
    return { events: [], checkpoint: cp };
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/hermes.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage/sources/hermes.ts src/lib/usage/__tests__/hermes.test.ts
git commit -m "feat(usage): add hermes adapter"
```

---

### Task 9: 源注册表 + 索引器 indexer.ts

**Files:**
- Create: `src/lib/usage/sources/index.ts`（registry + scanSource 分发）
- Create: `src/lib/usage/indexer.ts`
- Test: `src/lib/usage/__tests__/indexer.test.ts`

**Interfaces:**
- Consumes: 全部 adapter（Task 4–8）、`UsageCache`（Task 3）、`USAGE_SOURCE_PATHS`/`usageCachePath`（Task 1）、`loadCcSwitchPricing`（Task 2）。
- Produces:
  - `const SOURCE_LABELS: Record<UsageSource, string>`（`cc-switch`→'CC Switch'，`claude`→'Claude'，`codex`→'Codex'，`opencode`→'opencode'，`hermes`→'hermes'，`openclaw`→'openclaw'）
  - `function checkSourceAvailability(id: ActiveUsageSource): { ok: boolean; reason?: string }`
  - `function runIndex(only?: ActiveUsageSource[]): { sources: SourceInfo[]; inserted: number }`
  - `function indexIfStale(maxAgeMs = 5 * 60_000): void`（events 路由用：meta `last_index_ms` 超时则 runIndex）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { runIndex, checkSourceAvailability, SOURCE_LABELS } from '../indexer';
import { makeCcSwitchDb, tmpDir, rmTmp } from './fixtures';

const dir = tmpDir('indexer-');
const ccDb = path.join(dir, 'cc.db');
const ocDb = path.join(dir, 'oc.db');
const cacheDb = path.join(dir, 'cache.db');

beforeAll(() => {
  makeCcSwitchDb(ccDb, [
    { request_id: 'r1', app_type: 'opencode', model: 'deepseek-v4-flash', input_tokens: 10,
      output_tokens: 5, total_cost_usd: '0.01', status_code: 200, created_at: 1000 },
  ]);
  const db = new DatabaseSync(ocDb);
  db.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, cost REAL NOT NULL DEFAULT 0,
    tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_reasoning INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL, data TEXT NOT NULL)`);
  db.prepare(`INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)`).run(
    's1', 0.5, 100, 200, 0, 2000);
  db.prepare(`INSERT INTO message VALUES (?, ?, ?, ?)`).run(
    'm1', 's1', 2000, JSON.stringify({ model: { modelID: 'm2' } }));
  db.close();
});

afterAll(() => rmTmp(dir));

describe('runIndex', () => {
  it('scans configured sources into cache, openclaw not-supported', () => {
    const env = {
      ...process.env,
      AIHOME_USAGE_CCSWITCH_DB: ccDb,
      AIHOME_USAGE_OPENCODE_DB: ocDb,
      AIHOME_USAGE_CLAUDE_DIR: path.join(dir, 'no-claude'),
      AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
      AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
      AIHOME_USAGE_CACHE: cacheDb,
    };
    const prev = { ...process.env };
    Object.assign(process.env, env);
    try {
      const res = runIndex();
      const byId = Object.fromEntries(res.sources.map((s) => [s.id, s]));
      expect(byId['cc-switch'].status).toBe('ready');
      expect(byId['cc-switch'].eventCount).toBe(1);
      expect(byId.opencode.status).toBe('ready');
      expect(byId.opencode.eventCount).toBe(1);
      expect(byId.openclaw.status).toBe('not-supported');
      expect(res.inserted).toBe(2);
      const res2 = runIndex();
      expect(res2.inserted).toBe(0);
    } finally {
      process.env = prev;
    }
  });
  it('marks missing sources unavailable', () => {
    expect(checkSourceAvailability('hermes').ok).toBe(false);
  });
});

describe('SOURCE_LABELS', () => {
  it('has labels for all sources', () => {
    for (const id of Object.keys(SOURCE_LABELS)) expect(SOURCE_LABELS[id as keyof typeof SOURCE_LABELS]).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/indexer.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 sources/index.ts**

```ts
import { existsSync } from 'fs';
import type { ActiveUsageSource, Checkpoint, ScannedEvent, UsageSource } from '../types';
import { scanCcSwitch } from './ccswitch';
import { scanClaude } from './claude';
import { scanCodex } from './codex';
import { scanOpencode } from './opencode';
import { scanHermes } from './hermes';
import { USAGE_SOURCE_PATHS } from '../paths';
import type { ModelPricing } from '../pricing';

export interface AdapterScan {
  events: ScannedEvent[];
  checkpoint: Checkpoint;
}

type Adapter = (path: string, cp: Checkpoint, pricing: (m: string) => ModelPricing | null) => AdapterScan;

const ADAPTERS: Record<ActiveUsageSource, Adapter> = {
  'cc-switch': (p, cp) => scanCcSwitch(p, cp),
  claude: (p, cp, pricing) => scanClaude(p, cp, pricing),
  codex: (p, cp, pricing) => scanCodex(p, cp, pricing),
  opencode: (p, cp) => scanOpencode(p, cp),
  hermes: (p, cp) => scanHermes(p, cp),
};

export function checkSourceAvailability(id: ActiveUsageSource): { ok: boolean; reason?: string } {
  const p = USAGE_SOURCE_PATHS[id]();
  if (!existsSync(p)) return { ok: false, reason: `not found: ${p}` };
  return { ok: true };
}

export function scanSource(
  id: ActiveUsageSource,
  cp: Checkpoint,
  pricing: (m: string) => ModelPricing | null
): AdapterScan {
  const p = USAGE_SOURCE_PATHS[id]();
  return ADAPTERS[id](p, cp, pricing);
}
```

- [ ] **Step 4: 实现 indexer.ts**

```ts
import { USAGE_SOURCE_PATHS, usageCachePath } from './paths';
import { UsageCache } from './cache';
import { ACTIVE_SOURCES, type ActiveUsageSource, type SourceInfo, type UsageSource } from './types';
import { loadCcSwitchPricing, getPricing } from './pricing';
import { scanSource, checkSourceAvailability } from './sources';
import { existsSync } from 'fs';

export const SOURCE_LABELS: Record<UsageSource, string> = {
  'cc-switch': 'CC Switch',
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'opencode',
  hermes: 'hermes',
  openclaw: 'openclaw',
};

export const ALL_SOURCES: UsageSource[] = [...ACTIVE_SOURCES, 'openclaw'];

export interface IndexResult {
  sources: SourceInfo[];
  inserted: number;
}

export function runIndex(only?: ActiveUsageSource[]): IndexResult {
  const cache = UsageCache.open(usageCachePath());
  const ccPricing = loadCcSwitchPricing(USAGE_SOURCE_PATHS['cc-switch']());
  const pricing = (model: string) => getPricing(model, ccPricing);
  const targets = only && only.length > 0 ? only : ACTIVE_SOURCES;
  const sources: SourceInfo[] = [];
  let inserted = 0;
  try {
    for (const id of targets) {
      try {
        const cp = cache.getCheckpoint(id);
        const { events, checkpoint } = scanSource(id, cp, pricing);
        cache.insertEvents(events);
        cache.setCheckpoint(id, checkpoint);
        cache.setMeta(`last_index_${id}`, String(Date.now()));
        inserted += events.length;
        sources.push({
          id,
          label: SOURCE_LABELS[id],
          status: 'ready',
          lastScanAt: Date.now(),
          eventCount: cache.countEvents(id),
        });
      } catch (error) {
        sources.push({
          id,
          label: SOURCE_LABELS[id],
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const id of ALL_SOURCES) {
      if (id === 'openclaw') {
        sources.push({
          id: 'openclaw',
          label: SOURCE_LABELS.openclaw,
          status: 'not-supported',
          message: 'no local usage data (upstream does not expose it)',
        });
        continue;
      }
      if (sources.some((s) => s.id === id)) continue;
      const avail = checkSourceAvailability(id);
      sources.push({
        id,
        label: SOURCE_LABELS[id],
        status: avail.ok ? 'ready' : 'unavailable',
        message: avail.reason,
        eventCount: cache.countEvents(id),
      });
    }
    cache.setMeta('last_index_ms', String(Date.now()));
  } finally {
    cache.close();
  }
  return { sources, inserted };
}

export function indexIfStale(maxAgeMs = 5 * 60_000): void {
  const cache = UsageCache.open(usageCachePath());
  let stale = true;
  try {
    const last = Number(cache.getMeta('last_index_ms')) || 0;
    stale = Date.now() - last > maxAgeMs;
  } finally {
    cache.close();
  }
  if (stale) runIndex();
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/indexer.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/usage/sources/index.ts src/lib/usage/indexer.ts src/lib/usage/__tests__/indexer.test.ts
git commit -m "feat(usage): add source registry and incremental indexer"
```

---

### Task 10: 聚合纯函数 aggregate.ts

**Files:**
- Create: `src/lib/usage/aggregate.ts`
- Test: `src/lib/usage/__tests__/aggregate.test.ts`

**Interfaces:**
- Consumes: `UsageEvent`（Task 1）。
- Produces:
  - `type UsageRange = '5m' | '15m' | '30m' | '1h' | '24h' | '7d' | '30d'`
  - `const USAGE_RANGES: UsageRange[]`
  - `function rangeMs(range: UsageRange): number`
  - `function bucketMsForRange(range: UsageRange): number`（5m/15m/30m→同值 ms；1h→1h；24h→1h；7d→1h；30d→1d）
  - `interface KlineBucket { start: number; open: number; high: number; low: number; close: number; count: number }`
  - `function buildKline(events: UsageEvent[], bucketMs: number, dimension: 'cost' | 'tokens'): KlineBucket[]`（**空桶跳过**：连续时间分桶，只输出有事件的桶）
  - `function totalsFor(events: UsageEvent[], now?: number): { today: number; week: number; month: number; requests: number; tokensInput: number; tokensOutput: number }`
  - `function groupBySource(events): Array<{ source: string; cost: number; tokens: number; count: number }>`
  - `function groupByModel(events, limit = 10): Array<{ model: string; cost: number; tokens: number; count: number }>`
  - `function byDay(events): Array<{ day: string; cost: number; tokens: number; count: number }>`（day = `YYYY-MM-DD`，本地时区）
  - `interface TableRow { source: string; cost24h: number; tokens24h: number; costMonth: number; tokensMonth: number; models: Array<{ model: string; cost24h: number; tokens24h: number; costMonth: number; tokensMonth: number }> }`
  - `function buildTable(events: UsageEvent[], now?: number): TableRow[]`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import {
  buildKline, totalsFor, groupBySource, groupByModel, byDay, buildTable,
  bucketMsForRange, rangeMs,
} from '../aggregate';
import type { UsageEvent } from '../types';

const ev = (ts: number, cost: number, tokens: number, source = 'cc-switch', model = 'm1'): UsageEvent => ({
  source: source as UsageEvent['source'], provider: source, model,
  inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
  costUsd: cost, timestamp: ts,
});

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);

describe('bucketMsForRange / rangeMs', () => {
  it('maps ranges', () => {
    expect(rangeMs('24h')).toBe(24 * 3600_000);
    expect(bucketMsForRange('5m')).toBe(5 * 60_000);
    expect(bucketMsForRange('24h')).toBe(3600_000);
    expect(bucketMsForRange('30d')).toBe(24 * 3600_000);
  });
});

describe('buildKline', () => {
  it('computes OHLC per bucket, skips empty buckets', () => {
    const bucket = 60_000;
    const events = [
      ev(NOW, 1, 10), ev(NOW + 10_000, 5, 10), ev(NOW + 20_000, 3, 10),
      ev(NOW + 90_000, 7, 10),
    ];
    const k = buildKline(events, bucket, 'cost');
    expect(k).toHaveLength(2);
    expect(k[0]).toEqual({ start: NOW, open: 1, high: 5, low: 1, close: 3, count: 3 });
    expect(k[1]).toEqual({ start: NOW + 60_000, open: 7, high: 7, low: 7, close: 7, count: 1 });
  });
});

describe('totalsFor', () => {
  it('computes today/week/month windows', () => {
    const events = [
      ev(NOW - 3 * 3600_000, 1, 10),
      ev(NOW - 2 * 24 * 3600_000, 2, 10),
      ev(NOW - 10 * 24 * 3600_000, 4, 10),
    ];
    const t = totalsFor(events, NOW);
    expect(t.today).toBe(1);
    expect(t.week).toBe(3);
    expect(t.month).toBe(7);
    expect(t.requests).toBe(3);
  });
});

describe('groupBySource / groupByModel / byDay', () => {
  it('groups by source', () => {
    const g = groupBySource([ev(NOW, 1, 10), ev(NOW, 2, 20, 'claude')]);
    expect(g.find((x) => x.source === 'cc-switch')).toMatchObject({ cost: 1, tokens: 10, count: 1 });
  });
  it('top models limited', () => {
    const events = Array.from({ length: 12 }, (_, i) => ev(NOW, 1, 1, 'cc-switch', `m${i}`));
    expect(groupByModel(events, 5)).toHaveLength(5);
  });
  it('byDay uses local YYYY-MM-DD', () => {
    const d = byDay([ev(Date.UTC(2026, 7, 5, 12), 3, 30)]);
    expect(d[0].day).toBe('2026-08-05');
    expect(d[0].cost).toBe(3);
  });
});

describe('buildTable', () => {
  it('groups source->model with 24h and month windows', () => {
    const events = [
      ev(NOW - 1000, 1, 10, 'cc-switch', 'm1'),
      ev(NOW - 3 * 24 * 3600_000, 2, 10, 'cc-switch', 'm1'),
    ];
    const rows = buildTable(events, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('cc-switch');
    expect(rows[0].cost24h).toBe(1);
    expect(rows[0].costMonth).toBe(3);
    expect(rows[0].models[0].model).toBe('m1');
    expect(rows[0].models[0].tokens24h).toBe(10);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/aggregate.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 aggregate.ts**

```ts
import type { UsageEvent } from './types';

export type UsageRange = '5m' | '15m' | '30m' | '1h' | '24h' | '7d' | '30d';
export type UsageDimension = 'cost' | 'tokens';

export const USAGE_RANGES: UsageRange[] = ['5m', '15m', '30m', '1h', '24h', '7d', '30d'];

export function rangeMs(range: UsageRange): number {
  const m = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '24h': 1440, '7d': 10080, '30d': 43200 }[range];
  return m * 60_000;
}

export function bucketMsForRange(range: UsageRange): number {
  if (range === '30d') return 24 * 3600_000;
  if (range === '5m' || range === '15m' || range === '30m') return rangeMs(range);
  return 3600_000;
}

export interface KlineBucket {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
  count: number;
}

function valueOf(e: UsageEvent, dimension: UsageDimension): number {
  return dimension === 'cost'
    ? e.costUsd
    : e.inputTokens + e.outputTokens + e.cacheReadTokens + e.cacheWriteTokens;
}

export function buildKline(
  events: UsageEvent[],
  bucketMs: number,
  dimension: UsageDimension
): KlineBucket[] {
  const buckets = new Map<number, KlineBucket>();
  for (const e of events) {
    const start = Math.floor(e.timestamp / bucketMs) * bucketMs;
    const v = valueOf(e, dimension);
    const b = buckets.get(start);
    if (!b) {
      buckets.set(start, { start, open: v, high: v, low: v, close: v, count: 1 });
    } else {
      b.high = Math.max(b.high, v);
      b.low = Math.min(b.low, v);
      b.close = v;
      b.count += 1;
    }
  }
  return [...buckets.values()].sort((a, b) => a.start - b.start);
}

export interface Totals {
  today: number;
  week: number;
  month: number;
  requests: number;
  tokensInput: number;
  tokensOutput: number;
}

export function totalsFor(events: UsageEvent[], now = Date.now()): Totals {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayMs = dayStart.getTime();
  const weekStart = dayMs - dayStart.getDay() * 24 * 3600_000;
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const t: Totals = { today: 0, week: 0, month: 0, requests: events.length, tokensInput: 0, tokensOutput: 0 };
  for (const e of events) {
    t.tokensInput += e.inputTokens;
    t.tokensOutput += e.outputTokens;
    if (e.timestamp >= dayMs) t.today += e.costUsd;
    if (e.timestamp >= weekStart) t.week += e.costUsd;
    if (e.timestamp >= monthStart.getTime()) t.month += e.costUsd;
  }
  return t;
}

export function groupBySource(events: UsageEvent[]): Array<{ source: string; cost: number; tokens: number; count: number }> {
  const map = new Map<string, { cost: number; tokens: number; count: number }>();
  for (const e of events) {
    const g = map.get(e.source) ?? { cost: 0, tokens: 0, count: 0 };
    g.cost += e.costUsd;
    g.tokens += e.inputTokens + e.outputTokens;
    g.count += 1;
    map.set(e.source, g);
  }
  return [...map.entries()]
    .map(([source, g]) => ({ source, ...g }))
    .sort((a, b) => b.cost - a.cost);
}

export function groupByModel(events: UsageEvent[], limit = 10): Array<{ model: string; cost: number; tokens: number; count: number }> {
  const map = new Map<string, { cost: number; tokens: number; count: number }>();
  for (const e of events) {
    const g = map.get(e.model) ?? { cost: 0, tokens: 0, count: 0 };
    g.cost += e.costUsd;
    g.tokens += e.inputTokens + e.outputTokens;
    g.count += 1;
    map.set(e.model, g);
  }
  return [...map.entries()]
    .map(([model, g]) => ({ model, ...g }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit);
}

export function byDay(events: UsageEvent[]): Array<{ day: string; cost: number; tokens: number; count: number }> {
  const map = new Map<string, { cost: number; tokens: number; count: number }>();
  for (const e of events) {
    const d = new Date(e.timestamp);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const g = map.get(day) ?? { cost: 0, tokens: 0, count: 0 };
    g.cost += e.costUsd;
    g.tokens += e.inputTokens + e.outputTokens;
    g.count += 1;
    map.set(day, g);
  }
  return [...map.entries()]
    .map(([day, g]) => ({ day, ...g }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

export interface TableModelRow {
  model: string;
  cost24h: number;
  tokens24h: number;
  costMonth: number;
  tokensMonth: number;
}

export interface TableRow {
  source: string;
  cost24h: number;
  tokens24h: number;
  costMonth: number;
  tokensMonth: number;
  models: TableModelRow[];
}

export function buildTable(events: UsageEvent[], now = Date.now()): TableRow[] {
  const since24h = now - 24 * 3600_000;
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const sinceMonth = monthStart.getTime();
  const bySource = new Map<string, Map<string, TableModelRow>>();
  for (const e of events) {
    const models = bySource.get(e.source) ?? new Map<string, TableModelRow>();
    bySource.set(e.source, models);
    const row = models.get(e.model) ?? { model: e.model, cost24h: 0, tokens24h: 0, costMonth: 0, tokensMonth: 0 };
    const tokens = e.inputTokens + e.outputTokens;
    if (e.timestamp >= since24h) {
      row.cost24h += e.costUsd;
      row.tokens24h += tokens;
    }
    if (e.timestamp >= sinceMonth) {
      row.costMonth += e.costUsd;
      row.tokensMonth += tokens;
    }
    models.set(e.model, row);
  }
  const out: TableRow[] = [];
  for (const [source, models] of bySource) {
    const modelRows = [...models.values()].sort((a, b) => b.cost24h + b.costMonth - (a.cost24h + a.costMonth));
    const total: TableRow = {
      source,
      cost24h: 0, tokens24h: 0, costMonth: 0, tokensMonth: 0,
      models: modelRows,
    };
    for (const m of modelRows) {
      total.cost24h += m.cost24h;
      total.tokens24h += m.tokens24h;
      total.costMonth += m.costMonth;
      total.tokensMonth += m.tokensMonth;
    }
    out.push(total);
  }
  return out.sort((a, b) => b.cost24h + b.costMonth - (a.cost24h + a.costMonth));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/aggregate.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage/aggregate.ts src/lib/usage/__tests__/aggregate.test.ts
git commit -m "feat(usage): add aggregation functions (kline, totals, tables)"
```

---

### Task 11: API 路由

**Files:**
- Create: `src/app/api/usage/events/route.ts`
- Create: `src/app/api/usage/sources/route.ts`
- Create: `src/app/api/usage/rescan/route.ts`
- Test: `src/lib/usage/__tests__/api-routes.test.ts`（直接调用 handler 函数）

**Interfaces:**
- Consumes: `runIndex`/`indexIfStale`/`ALL_SOURCES`/`SOURCE_LABELS`（Task 9）、`UsageCache`（Task 3）、aggregate 全部（Task 10）、`USAGE_RANGES`。
- Produces:
  - `GET /api/usage/events?source=all|cc-switch|claude|codex|opencode|hermes&range=5m..30d&dimension=cost|tokens` → `{ totals, kline, stats: { byDay, bySource, topModels }, table, sourceStatus }`
  - `GET /api/usage/sources` → `{ sources: SourceInfo[] }`（不触发索引，只做可用性检查 + 缓存计数）
  - `POST /api/usage/rescan`（body `{ only?: string[] }`）→ `runIndex` 结果

**响应形状**：

```ts
interface EventsResponse {
  totals: Totals;
  kline: KlineBucket[];
  stats: { byDay: DayRow[]; bySource: SourceGroup[]; topModels: ModelGroup[] };
  table: TableRow[];
  sourceStatus: SourceInfo[];
}
```

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { GET as eventsGet } from '@/app/api/usage/events/route';
import { GET as sourcesGet } from '@/app/api/usage/sources/route';
import { POST as rescanPost } from '@/app/api/usage/rescan/route';
import { makeCcSwitchDb, tmpDir, rmTmp } from './fixtures';

const dir = tmpDir('api-');
const ccDb = path.join(dir, 'cc.db');
const cacheDb = path.join(dir, 'cache.db');
const prev = { ...process.env };

beforeAll(() => {
  makeCcSwitchDb(ccDb, [
    { request_id: 'r1', app_type: 'opencode', model: 'deepseek-v4-flash', input_tokens: 10,
      output_tokens: 5, total_cost_usd: '0.01', status_code: 200,
      created_at: Math.floor((Date.now() - 3600_000) / 1000) },
  ]);
  const db = new DatabaseSync(path.join(dir, 'oc.db'));
  db.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, cost REAL NOT NULL DEFAULT 0,
    tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_reasoning INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL, data TEXT NOT NULL)`);
  db.prepare(`INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)`).run(
    's1', 0.5, 100, 200, 0, Date.now() - 3600_000);
  db.prepare(`INSERT INTO message VALUES (?, ?, ?, ?)`).run(
    'm1', 's1', Date.now() - 3600_000, JSON.stringify({ model: { modelID: 'm2' } }));
  db.close();
  Object.assign(process.env, {
    AIHOME_USAGE_CCSWITCH_DB: ccDb,
    AIHOME_USAGE_OPENCODE_DB: path.join(dir, 'oc.db'),
    AIHOME_USAGE_CLAUDE_DIR: path.join(dir, 'no-claude'),
    AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
    AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
    AIHOME_USAGE_CACHE: cacheDb,
  });
});

afterAll(() => {
  process.env = prev;
  rmTmp(dir);
});

const makeRequest = (url: string, init?: RequestInit) => new Request(url, init);

describe('usage API routes', () => {
  it('events: aggregates cached data', async () => {
    await rescanPost(makeRequest('http://localhost/api/usage/rescan', {
      method: 'POST', body: JSON.stringify({}),
    }));
    const res = await eventsGet(makeRequest('http://localhost/api/usage/events?range=24h&source=all&dimension=cost'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totals.requests).toBeGreaterThanOrEqual(1);
    expect(data.totals.month).toBeGreaterThan(0);
    expect(data.kline.length).toBeGreaterThan(0);
    expect(data.table.length).toBeGreaterThanOrEqual(1);
    expect(data.stats.bySource.length).toBeGreaterThanOrEqual(1);
    expect(data.sourceStatus.length).toBe(6);
    const openclaw = data.sourceStatus.find((s: { id: string }) => s.id === 'openclaw');
    expect(openclaw.status).toBe('not-supported');
  });
  it('events: invalid range falls back to default', async () => {
    const res = await eventsGet(makeRequest('http://localhost/api/usage/events?range=bogus'));
    expect(res.status).toBe(200);
  });
  it('sources: reports availability without indexing', async () => {
    const res = await sourcesGet(makeRequest('http://localhost/api/usage/sources'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources.length).toBe(6);
  });
  it('rescan: validates only param', async () => {
    const res = await rescanPost(makeRequest('http://localhost/api/usage/rescan', {
      method: 'POST', body: JSON.stringify({ only: ['hermes'] }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources.map((s: { id: string }) => s.id)).toContain('hermes');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/usage/__tests__/api-routes.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 events/route.ts**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { usageCachePath } from '@/lib/usage/paths';
import { UsageCache } from '@/lib/usage/cache';
import { ACTIVE_SOURCES, type ActiveUsageSource } from '@/lib/usage/types';
import { indexIfStale, SOURCE_LABELS } from '@/lib/usage/indexer';
import {
  buildKline, bucketMsForRange, rangeMs, totalsFor, groupBySource, groupByModel,
  byDay, buildTable,
  type UsageRange, type UsageDimension,
} from '@/lib/usage/aggregate';

const RANGES: UsageRange[] = ['5m', '15m', '30m', '1h', '24h', '7d', '30d'];
const DIMENSIONS: UsageDimension[] = ['cost', 'tokens'];

export async function GET(request: NextRequest) {
  try {
    indexIfStale();
    const { searchParams } = new URL(request.url);
    const sourceParam = searchParams.get('source') ?? 'all';
    const rangeParam = searchParams.get('range') ?? '24h';
    const dimensionParam = searchParams.get('dimension') ?? 'cost';
    const range: UsageRange = RANGES.includes(rangeParam as UsageRange)
      ? (rangeParam as UsageRange)
      : '24h';
    const dimension: UsageDimension = DIMENSIONS.includes(dimensionParam as UsageDimension)
      ? (dimensionParam as UsageDimension)
      : 'cost';
    const sources: ActiveUsageSource[] =
      sourceParam === 'all' || !ACTIVE_SOURCES.includes(sourceParam as ActiveUsageSource)
        ? ACTIVE_SOURCES
        : [sourceParam as ActiveUsageSource];

    const cache = UsageCache.open(usageCachePath());
    try {
      const now = Date.now();
      const since = now - Math.max(rangeMs(range), 30 * 24 * 3600_000);
      const events = cache.queryEvents(sources, since);
      const bucketMs = bucketMsForRange(range);
      const windowStart = now - rangeMs(range);
      const windowEvents = events.filter((e) => e.timestamp >= windowStart);
      const sourceStatus = ACTIVE_SOURCES.map((id) => ({
        id,
        label: SOURCE_LABELS[id],
        status: 'ready' as const,
        eventCount: cache.countEvents(id),
      }));
      sourceStatus.push({
        id: 'openclaw',
        label: SOURCE_LABELS.openclaw,
        status: 'not-supported' as const,
        message: 'no local usage data',
      });
      return NextResponse.json({
        totals: totalsFor(events, now),
        kline: buildKline(windowEvents, bucketMs, dimension),
        stats: {
          byDay: byDay(windowEvents),
          bySource: groupBySource(windowEvents),
          topModels: groupByModel(windowEvents),
        },
        table: buildTable(events, now),
        sourceStatus,
      });
    } finally {
      cache.close();
    }
  } catch (error) {
    console.error('Usage events error:', error);
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 });
  }
}
```

- [ ] **Step 4: 实现 sources/route.ts**

```ts
import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { usageCachePath, USAGE_SOURCE_PATHS } from '@/lib/usage/paths';
import { UsageCache } from '@/lib/usage/cache';
import { ACTIVE_SOURCES, type ActiveUsageSource, type SourceInfo } from '@/lib/usage/types';
import { SOURCE_LABELS } from '@/lib/usage/indexer';

export async function GET() {
  try {
    const cache = UsageCache.open(usageCachePath());
    const sources: SourceInfo[] = [];
    try {
      for (const id of ACTIVE_SOURCES) {
        const p = USAGE_SOURCE_PATHS[id]();
        sources.push({
          id,
          label: SOURCE_LABELS[id],
          status: existsSync(p) ? 'ready' : 'unavailable',
          message: existsSync(p) ? undefined : `not found: ${p}`,
          eventCount: cache.countEvents(id),
        });
      }
      sources.push({
        id: 'openclaw',
        label: SOURCE_LABELS.openclaw,
        status: 'not-supported',
        message: 'no local usage data',
      });
    } finally {
      cache.close();
    }
    return NextResponse.json({ sources });
  } catch (error) {
    console.error('Usage sources error:', error);
    return NextResponse.json({ error: 'Failed to load usage sources' }, { status: 500 });
  }
}
```

> 注：`ActiveUsageSource` 仅在类型上用，未直接引用则从 import 中移除，保证 lint 零告警。

- [ ] **Step 5: 实现 rescan/route.ts**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_SOURCES, type ActiveUsageSource } from '@/lib/usage/types';
import { runIndex } from '@/lib/usage/indexer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const onlyParam = Array.isArray(body.only) ? body.only : undefined;
    const only: ActiveUsageSource[] | undefined = onlyParam
      ? onlyParam.filter((n: unknown) => ACTIVE_SOURCES.includes(n as ActiveUsageSource)) as ActiveUsageSource[]
      : undefined;
    const result = runIndex(only);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to rescan' },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run src/lib/usage/__tests__/api-routes.test.ts`
Expected: PASS。

- [ ] **Step 7: lint + 全量单测**

Run: `npm run lint && npm run test`
Expected: 全部通过。

- [ ] **Step 8: Commit**

```bash
git add src/app/api/usage src/lib/usage/__tests__/api-routes.test.ts
git commit -m "feat(usage): add usage API routes (events, sources, rescan)"
```

---

### Task 12: USAGE 导航 + /usage 页面骨架 + 总览卡片

**Files:**
- Modify: `src/components/layout/TopNav.tsx`
- Create: `src/app/usage/page.tsx`
- Create: `src/components/usage/OverviewCards.tsx`
- Create: `src/components/usage/UsageFilters.tsx`（源 + 时间范围 + 重新扫描）

**Interfaces:**
- Consumes: API `/api/usage/events`、`/api/usage/sources`、`/api/usage/rescan`（Task 11）。
- Produces: 页面 filter 状态 `{ source: string; range: UsageRange; dimension: UsageDimension }`；组件 props（见下）。

- [x] **Step 1: TopNav 加 USAGE 项**

在 `src/components/layout/TopNav.tsx` 的 `navItems` 中，`/agents` 与 `/sync` 之间插入：

```ts
{ href: '/usage', label: 'USAGE', testId: 'nav-usage' },
```

- [x] **Step 2: 写 OverviewCards 组件**

```tsx
'use client';

import type { Totals } from '@/lib/usage/aggregate';

interface Props {
  totals: Totals;
}

function formatMoney(v: number): string {
  return `$${v.toFixed(2)}`;
}

export function OverviewCards({ totals }: Props) {
  const cards = [
    { label: 'Today', value: formatMoney(totals.today), testId: 'usage-overview-today' },
    { label: 'This Week', value: formatMoney(totals.week), testId: 'usage-overview-week' },
    { label: 'This Month', value: formatMoney(totals.month), testId: 'usage-overview-month' },
    { label: 'Requests', value: String(totals.requests), testId: 'usage-overview-requests' },
    { label: 'Tokens', value: String(totals.tokensInput + totals.tokensOutput), testId: 'usage-overview-tokens' },
  ];
  return (
    <section data-testid="usage-overview" className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} data-testid={c.testId} className="rounded-lg border border-divider bg-white/80 p-4">
          <p className="text-xs font-medium tracking-widest text-secondary">{c.label}</p>
          <p className="font-heading text-xl font-bold text-primary mt-1">{c.value}</p>
        </div>
      ))}
    </section>
  );
}
```

- [x] **Step 3: 写 UsageFilters 组件**

```tsx
'use client';

import { USAGE_RANGES, type UsageRange } from '@/lib/usage/aggregate';

export const SOURCE_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'cc-switch', label: 'CC Switch' },
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'opencode', label: 'opencode' },
  { id: 'hermes', label: 'hermes' },
];

interface Props {
  source: string;
  range: UsageRange;
  onSourceChange: (s: string) => void;
  onRangeChange: (r: UsageRange) => void;
  onRescan: () => void;
  rescanning: boolean;
}

export function UsageFilters({ source, range, onSourceChange, onRangeChange, onRescan, rescanning }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex gap-1">
        {SOURCE_OPTIONS.map((s) => (
          <button
            key={s.id}
            data-testid={`usage-source-${s.id}`}
            onClick={() => onSourceChange(s.id)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              source === s.id
                ? 'bg-primary text-white border-primary'
                : 'border-divider text-secondary hover:text-primary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {USAGE_RANGES.map((r) => (
          <button
            key={r}
            data-testid={`usage-range-${r}`}
            onClick={() => onRangeChange(r)}
            className={`px-2 py-1.5 text-xs rounded-md border transition-colors ${
              range === r
                ? 'bg-primary text-white border-primary'
                : 'border-divider text-secondary hover:text-primary'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <button
        data-testid="usage-rescan"
        onClick={onRescan}
        disabled={rescanning}
        className="ml-auto px-3 py-1.5 text-sm rounded-md border border-divider text-secondary hover:text-primary disabled:opacity-50"
      >
        {rescanning ? 'Scanning…' : 'Rescan'}
      </button>
    </div>
  );
}
```

- [x] **Step 4: 写 usage/page.tsx（骨架，K线/图表/表格占位后续 task 接入）**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { OverviewCards } from '@/components/usage/OverviewCards';
import { UsageFilters } from '@/components/usage/UsageFilters';
import type { Totals, UsageRange, KlineBucket, TableRow } from '@/lib/usage/aggregate';

interface EventsResponse {
  totals: Totals;
  kline: KlineBucket[];
  stats: { byDay: Array<{ day: string; cost: number; tokens: number; count: number }>; bySource: Array<{ source: string; cost: number; tokens: number; count: number }>; topModels: Array<{ model: string; cost: number; tokens: number; count: number }> };
  table: TableRow[];
  sourceStatus: Array<{ id: string; label: string; status: string; eventCount?: number }>;
}

export default function UsagePage() {
  const [source, setSource] = useState('all');
  const [range, setRange] = useState<UsageRange>('24h');
  const [dimension, setDimension] = useState<'cost' | 'tokens'>('cost');
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/usage/events?source=${source}&range=${range}&dimension=${dimension}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'load failed');
      setData(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }, [source, range, dimension]);

  useEffect(() => {
    load();
  }, [load]);

  const rescan = useCallback(async () => {
    setRescanning(true);
    try {
      const res = await fetch('/api/usage/rescan', { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) throw new Error('rescan failed');
      toast.success('Usage data refreshed');
      await load();
    } catch {
      toast.error('Rescan failed');
    } finally {
      setRescanning(false);
    }
  }, [load]);

  return (
    <main data-testid="usage-page" className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="font-heading text-3xl font-bold text-primary mb-6">Usage</h1>
      <UsageFilters
        source={source}
        range={range}
        onSourceChange={setSource}
        onRangeChange={setRange}
        onRescan={rescan}
        rescanning={rescanning}
      />
      {loading ? (
        <p className="text-sm text-secondary">Loading usage data…</p>
      ) : data ? (
        <>
          <div data-testid="usage-source-status" className="flex flex-wrap gap-2 mb-4">
            {data.sourceStatus.map((s) => (
              <span
                key={s.id}
                data-testid={`usage-status-${s.id}`}
                title={s.message ?? ''}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                  s.status === 'ready'
                    ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                    : s.status === 'unavailable'
                      ? 'border-neutral-200 text-neutral-500 bg-neutral-50'
                      : 'border-amber-200 text-amber-700 bg-amber-50'
                }`}
              >
                {s.label} · {s.status}
              </span>
            ))}
          </div>
          <OverviewCards totals={data.totals} />
          <div data-testid="usage-kline" className="rounded-lg border border-divider bg-white/80 p-4 mb-6">
            <p className="text-xs text-secondary">K-line chart lands in Task 13</p>
          </div>
          <div data-testid="usage-stats" className="rounded-lg border border-divider bg-white/80 p-4 mb-6">
            <p className="text-xs text-secondary">Stat charts land in Task 14</p>
          </div>
          <div data-testid="usage-table" className="rounded-lg border border-divider bg-white/80 p-4">
            <p className="text-xs text-secondary">Usage table lands in Task 14</p>
          </div>
        </>
      ) : null}
    </main>
  );
}
```

- [x] **Step 5: 手工验证**（2026-08-06 执行时跳过：3000 端口被并行会话占用；由 Task 15 e2e 的 webServer 启动覆盖验证）

Run: `npm run dev` → 打开 http://localhost:3000/usage
Expected: 导航出现 USAGE；页面显示筛选器 + 5 张总览卡片（本机真实数据非零）；Rescan 按钮可用。

- [x] **Step 6: lint + commit**

Run: `npm run lint`
Expected: 0 warnings。

```bash
git add src/components/layout/TopNav.tsx src/app/usage/page.tsx src/components/usage/OverviewCards.tsx src/components/usage/UsageFilters.tsx
git commit -m "feat(usage): add usage page skeleton with overview and filters"
```

---

### Task 13: K 线图 canvas 组件

**Files:**
- Create: `src/components/usage/KLineChart.tsx`
- Modify: `src/app/usage/page.tsx`（替换占位块）

**Interfaces:**
- Consumes: `KlineBucket[]`（Task 10）。
- Produces: `function KLineChart({ buckets, dimension }: { buckets: KlineBucket[]; dimension: 'cost' | 'tokens' }): JSX.Element`

**渲染规则**：
- 全尺寸 canvas（width 由容器决定，`ResizeObserver` 跟随），devicePixelRatio 缩放。
- Y 轴范围：桶内 min(low)~max(high)，留 10% 上下 padding；无数据/单值 → 用 ±1 保护（如值全 0 则 0..1）。
- 每根 K 线：实体（开收之间矩形）+ 上下影线；**涨红跌绿**（close≥open → `#ef4444`，否则 `#10b981`）；开=收时画 1px 横线。
- 最后一根 K 线外框黄色高亮（`#f59e0b`，2px）。
- hover：mousemove 命中最近桶，显示 tooltip（浮层 div，展示 `time / O H L C / count`），数据经 `data-tooltip` 事件回调给父组件渲染。
- 空数据：画空态文字 "No data in this range"。
- 容器 `data-testid="usage-kline-chart"`。

- [ ] **Step 1: 写组件**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { KlineBucket } from '@/lib/usage/aggregate';

interface Props {
  buckets: KlineBucket[];
  dimension: 'cost' | 'tokens';
}

const UP = '#ef4444';
const DOWN = '#10b981';
const HIGHLIGHT = '#f59e0b';

export function KLineChart({ buckets, dimension }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; bucket: KlineBucket } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(rect.width, 10);
      const h = 300;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (buckets.length === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data in this range', w / 2, h / 2);
        return;
      }

      let min = Infinity;
      let max = -Infinity;
      for (const b of buckets) {
        min = Math.min(min, b.low);
        max = Math.max(max, b.high);
      }
      if (min === max) {
        if (min === 0) { min = 0; max = 1; }
        else { min *= 0.9; max *= 1.1; }
      }
      const pad = (max - min) * 0.1;
      min -= pad;
      max += pad;

      const plotW = w - 8;
      const plotH = h - 8;
      const xStep = plotW / buckets.length;
      const candleW = Math.max(Math.min(xStep * 0.6, 40), 2);
      const yOf = (v: number) => 4 + plotH - ((v - min) / (max - min)) * plotH;

      buckets.forEach((b, i) => {
        const x = 4 + xStep * i + xStep / 2;
        const color = b.close >= b.open ? UP : DOWN;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yOf(b.high));
        ctx.lineTo(x, yOf(b.low));
        ctx.stroke();
        const top = yOf(Math.max(b.open, b.close));
        const height = Math.max(Math.abs(yOf(b.open) - yOf(b.close)), 1);
        ctx.fillStyle = color;
        ctx.fillRect(x - candleW / 2, top, candleW, height);
        if (b.open === b.close) {
          ctx.fillRect(x - candleW / 2, top, candleW, 1);
        }
      });

      const last = buckets[buckets.length - 1];
      const lx = 4 + plotW - xStep / 2;
      ctx.strokeStyle = HIGHLIGHT;
      ctx.lineWidth = 2;
      ctx.strokeRect(lx - candleW / 2 - 2, 2, candleW + 4, plotH);
      void last;
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [buckets]);

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || buckets.length === 0) return;
    const relX = e.clientX - rect.left - 4;
    const xStep = (rect.width - 8) / buckets.length;
    const idx = Math.max(0, Math.min(buckets.length - 1, Math.floor(relX / xStep)));
    const bucket = buckets[idx];
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, bucket });
  };

  const fmt = (v: number) => (dimension === 'cost' ? `$${v.toFixed(4)}` : String(Math.round(v)));

  return (
    <div ref={containerRef} data-testid="usage-kline-chart" className="relative">
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="w-full block"
      />
      {hover && (
        <div
          className="pointer-events-none absolute bg-neutral-900 text-white text-xs rounded px-2 py-1"
          style={{ left: hover.x, top: hover.y - 40 }}
        >
          {new Date(hover.bucket.start).toLocaleString()} · O {fmt(hover.bucket.open)} / H {fmt(hover.bucket.high)} / L {fmt(hover.bucket.low)} / C {fmt(hover.bucket.close)} · n={hover.bucket.count}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 接入 usage/page.tsx**

把 `data-testid="usage-kline"` 的占位块替换为：

```tsx
<div className="rounded-lg border border-divider bg-white/80 p-4 mb-6">
  <div className="flex items-center justify-between mb-2">
    <h2 className="font-heading text-lg font-bold text-primary">K-line</h2>
    <button
      data-testid="usage-dimension"
      onClick={() => setDimension((d) => (d === 'cost' ? 'tokens' : 'cost'))}
      className="text-xs text-secondary hover:text-primary"
    >
      {dimension === 'cost' ? 'Amount' : 'Tokens'}
    </button>
  </div>
  <KLineChart buckets={data.kline} dimension={dimension} />
</div>
```

并 import `KLineChart`。同时 `dimension` 状态已定义（Task 12 骨架中已有），确认 `load` 依赖数组含 `dimension`。

- [ ] **Step 3: 手工验证**

Run: `npm run dev` → /usage，切 5m/24h/7d 观察 K 线渲染与 hover tooltip；切换 Amount/Tokens。

- [ ] **Step 4: lint + commit**

Run: `npm run lint`
Expected: 0 warnings。

```bash
git add src/components/usage/KLineChart.tsx src/app/usage/page.tsx
git commit -m "feat(usage): add canvas k-line chart with hover tooltip"
```

---

### Task 14: 统计图表 + 用量表格

**Files:**
- Create: `src/components/usage/StatCharts.tsx`
- Create: `src/components/usage/UsageTable.tsx`
- Modify: `src/app/usage/page.tsx`（替换两个占位块）

**Interfaces:**
- Consumes: `EventsResponse['stats']`、`TableRow[]`（Task 10/11）。
- Produces:
  - `function StatCharts({ stats }: { stats: EventsResponse['stats'] })`
  - `function UsageTable({ rows }: { rows: TableRow[] })`

**StatCharts 渲染规则**（全部 CSS 柱条，无库）：
- 按日柱状图：每根柱高 = cost/maxCost；hover 显示 `day · $x.xx`（`title` 属性即可）。
- 按源占比：水平条 + 百分比（cost 占比）+ source 名。
- 模型 Top10：排名列表，每行 `model · cost · tokens · count`。

**UsageTable 渲染规则**：
- 表头：`Agent (source) | 24h Tokens | 24h Cost | Month Tokens | Month Cost`。
- 源行可折叠（useState `Set<string>`），展开显示该源各 model 行。
- 成本阈值色：`cost < 20` 绿（`text-emerald-600`）、`20–50` 黄（`text-amber-600`）、`≥50` 红（`text-red-600`），应用于 24h 与 Month 两列。
- 空状态："No usage data yet — click Rescan after using your AI tools."

- [ ] **Step 1: 写 StatCharts 组件**

```tsx
'use client';

interface Stats {
  byDay: Array<{ day: string; cost: number; tokens: number; count: number }>;
  bySource: Array<{ source: string; cost: number; tokens: number; count: number }>;
  topModels: Array<{ model: string; cost: number; tokens: number; count: number }>;
}

export function StatCharts({ stats }: { stats: Stats }) {
  const maxDay = Math.max(1, ...stats.byDay.map((d) => d.cost));
  const totalCost = Math.max(1e-9, stats.bySource.reduce((s, x) => s + x.cost, 0));
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="rounded-lg border border-divider bg-white/80 p-4">
        <h3 className="text-sm font-semibold text-primary mb-2">Daily Spend</h3>
        {stats.byDay.length === 0 ? (
          <p className="text-xs text-secondary">No data</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {stats.byDay.map((d) => (
              <div
                key={d.day}
                title={`${d.day} · $${d.cost.toFixed(4)} · ${d.count} req`}
                className="flex-1 bg-indigo-500/70 hover:bg-indigo-500 rounded-t transition-colors"
                style={{ height: `${Math.max((d.cost / maxDay) * 100, 2)}%` }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="rounded-lg border border-divider bg-white/80 p-4">
        <h3 className="text-sm font-semibold text-primary mb-2">By Source</h3>
        {stats.bySource.map((s) => {
          const pct = (s.cost / totalCost) * 100;
          return (
            <div key={s.source} className="mb-2">
              <div className="flex justify-between text-xs text-secondary mb-0.5">
                <span>{s.source}</span>
                <span>${s.cost.toFixed(4)} · {pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-neutral-100 rounded-full">
                <div className="h-2 bg-primary rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border border-divider bg-white/80 p-4">
        <h3 className="text-sm font-semibold text-primary mb-2">Top Models</h3>
        {stats.topModels.length === 0 ? (
          <p className="text-xs text-secondary">No data</p>
        ) : (
          <ol className="space-y-1">
            {stats.topModels.map((m, i) => (
              <li key={m.model} className="flex justify-between text-xs">
                <span className="text-secondary">{i + 1}. {m.model}</span>
                <span className="text-primary font-medium">${m.cost.toFixed(4)} · {m.count}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 写 UsageTable 组件**

```tsx
'use client';

import { useState } from 'react';
import type { TableRow } from '@/lib/usage/aggregate';

function costColor(v: number): string {
  if (v >= 50) return 'text-red-600';
  if (v >= 20) return 'text-amber-600';
  return 'text-emerald-600';
}

export function UsageTable({ rows }: { rows: TableRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (source: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <section data-testid="usage-table" className="rounded-lg border border-divider bg-white/80 p-8 text-center">
        <p className="text-sm text-secondary">
          No usage data yet — click Rescan after using your AI tools.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="usage-table" className="rounded-lg border border-divider bg-white/80 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs tracking-widest text-secondary border-b border-divider">
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3 text-right">24h Tokens</th>
            <th className="px-4 py-3 text-right">24h Cost</th>
            <th className="px-4 py-3 text-right">Month Tokens</th>
            <th className="px-4 py-3 text-right">Month Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = expanded.has(row.source);
            return (
              <>
                <tr key={row.source} className="border-b border-divider cursor-pointer hover:bg-neutral-50" onClick={() => toggle(row.source)}>
                  <td className="px-4 py-3 font-medium text-primary">
                    {open ? '▾' : '▸'} {row.source}
                  </td>
                  <td className="px-4 py-3 text-right text-secondary">{row.tokens24h.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right ${costColor(row.cost24h)}`}>${row.cost24h.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-secondary">{row.tokensMonth.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right ${costColor(row.costMonth)}`}>${row.costMonth.toFixed(2)}</td>
                </tr>
                {open &&
                  row.models.map((m) => (
                    <tr key={`${row.source}-${m.model}`} className="border-b border-divider bg-neutral-50/50 text-xs">
                      <td className="px-8 py-2 text-secondary">{m.model}</td>
                      <td className="px-4 py-2 text-right text-secondary">{m.tokens24h.toLocaleString()}</td>
                      <td className={`px-4 py-2 text-right ${costColor(m.cost24h)}`}>${m.cost24h.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-secondary">{m.tokensMonth.toLocaleString()}</td>
                      <td className={`px-4 py-2 text-right ${costColor(m.costMonth)}`}>${m.costMonth.toFixed(2)}</td>
                    </tr>
                  ))}
              </>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
```

> 注意：`<>` fragment 在 map 内需要 `key`——改为 `Fragment`（`import { Fragment, useState } from 'react'`）并在 `<Fragment key={row.source}>` 上挂 key，且子 `<tr>` 不再需要 key。实现时按 lint 提示修正。

- [ ] **Step 3: 接入 usage/page.tsx**

`data-testid="usage-stats"` 占位替换为 `<StatCharts stats={data.stats} />`（外留 mb-6 容器），`data-testid="usage-table"` 占位替换为 `<UsageTable rows={data.table} />`，并 import 两个组件。

- [ ] **Step 4: 手工验证**

Run: `npm run dev` → /usage：图表渲染、表格可折叠、成本颜色正确。

- [ ] **Step 5: lint + commit**

Run: `npm run lint`
Expected: 0 warnings。

```bash
git add src/components/usage/StatCharts.tsx src/components/usage/UsageTable.tsx src/app/usage/page.tsx
git commit -m "feat(usage): add stat charts and collapsible usage table"
```

---

### Task 15: E2E 测试

**Files:**
- Modify: `e2e/global-setup.ts`（建 `.e2e-usage` fixture 数据）
- Modify: `playwright.config.ts`（webServer.env 加 usage 环境变量）
- Modify: `e2e/helpers/selectors.ts`（加 nav.usage + usage selectors）
- Modify: `e2e/tests/01-navigation.spec.ts`（4→5 个导航链接）
- Create: `e2e/tests/09-usage.spec.ts`

**fixture 数据**（global-setup 内用 `node:sqlite` 创建，时间戳相对 `Date.now()`）：
- `.e2e-usage/cc-switch.db`：`proxy_request_logs` 2 行（1 条 200 在 1 小时前、1 条 500 失败）——沿用 Task 4 fixture 的 schema。
- `.e2e-usage/claude-projects/proj/s1.jsonl`：assistant 事件（新格式，1 小时前）。
- `.e2e-usage/codex-sessions/2026/08/rollout.jsonl`：config 事件 + token_count（info.last_token_usage，1 小时前）。
- `.e2e-usage/opencode.db`：session 1 行 + message（1 小时前）。
- `.e2e-usage/hermes.db`：session 1 行（1 小时前）。

- [ ] **Step 1: 更新 selectors.ts**

`nav` 加 `usage: '[data-testid="nav-usage"]'`；新增 `usage` 块：

```ts
usage: {
  page: '[data-testid="usage-page"]',
  overview: '[data-testid="usage-overview"]',
  overviewToday: '[data-testid="usage-overview-today"]',
  kline: '[data-testid="usage-kline"]',
  klineChart: '[data-testid="usage-kline-chart"]',
  stats: '[data-testid="usage-stats"]',
  table: '[data-testid="usage-table"]',
  sourceAll: '[data-testid="usage-source-all"]',
  sourceClaude: '[data-testid="usage-source-claude"]',
  range24h: '[data-testid="usage-range-24h"]',
  rescan: '[data-testid="usage-rescan"]',
},
```

- [ ] **Step 2: 更新 global-setup.ts**

在文件顶部 `import { DatabaseSync } from 'node:sqlite';`（playwright 跑在 Node 22+，OK）。在现有 fixture 创建后追加：

```ts
const usageRoot = path.join(root, 'e2e', '.e2e-usage');
fs.rmSync(usageRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(usageRoot, 'claude-projects', 'proj'), { recursive: true });
fs.mkdirSync(path.join(usageRoot, 'codex-sessions', '2026', '08'), { recursive: true });

const hourAgo = Math.floor(Date.now() / 1000) - 3600;
const ccDb = new DatabaseSync(path.join(usageRoot, 'cc-switch.db'));
ccDb.exec(`CREATE TABLE proxy_request_logs (
  request_id TEXT PRIMARY KEY, provider_id TEXT, app_type TEXT, model TEXT,
  input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0, cache_creation_tokens INTEGER DEFAULT 0,
  total_cost_usd TEXT DEFAULT '0', latency_ms INTEGER, session_id TEXT,
  status_code INTEGER, created_at INTEGER)`);
ccDb.prepare(`INSERT INTO proxy_request_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  'r-ok', 'p1', 'opencode', 'deepseek-v4-flash', 100, 50, 0, 0, '0.01', 300, 's1', 200, hourAgo);
ccDb.prepare(`INSERT INTO proxy_request_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  'r-fail', 'p1', 'opencode', 'deepseek-v4-flash', 1, 1, 0, 0, '0', 100, 's1', 500, hourAgo - 60);
ccDb.close();

fs.writeFileSync(
  path.join(usageRoot, 'claude-projects', 'proj', 's1.jsonl'),
  JSON.stringify({
    type: 'assistant', uuid: 'u1', timestamp: new Date(Date.now() - 3600_000).toISOString(),
    message: { model: 'glm-5.2', usage: { input_tokens: 500, output_tokens: 100,
      cache_read_input_tokens: 50, cache_creation_input_tokens: 10 } },
  }) + '\n'
);

fs.writeFileSync(
  path.join(usageRoot, 'codex-sessions', '2026', '08', 'rollout.jsonl'),
  JSON.stringify({ type: 'event_msg', payload: { model: 'gpt-5.5' } }) + '\n' +
  JSON.stringify({
    type: 'event_msg',
    timestamp: new Date(Date.now() - 3600_000).toISOString(),
    payload: { type: 'token_count', info: { last_token_usage: {
      input_tokens: 800, cached_input_tokens: 100, output_tokens: 200 } } },
  }) + '\n'
);

const ocDb = new DatabaseSync(path.join(usageRoot, 'opencode.db'));
ocDb.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, cost REAL NOT NULL DEFAULT 0,
  tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_reasoning INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL);
  CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL, data TEXT NOT NULL)`);
ocDb.prepare(`INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)`).run(
  's-oc', 0.25, 300, 150, 0, Date.now() - 3600_000);
ocDb.prepare(`INSERT INTO message VALUES (?, ?, ?, ?)`).run(
  'm-oc', 's-oc', Date.now() - 3600_000, JSON.stringify({ model: { modelID: 'deepseek-v4-flash' } }));
ocDb.close();

const hDb = new DatabaseSync(path.join(usageRoot, 'hermes.db'));
hDb.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, model TEXT, started_at REAL,
  input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
  estimated_cost_usd REAL, actual_cost_usd REAL)`);
hDb.prepare(`INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  'h-1', 'cli', 'qwen3.5-9b', (Date.now() - 3600_000) / 1000, 200, 80, 5, 2, 0, 0.05);
hDb.close();
```

- [ ] **Step 3: 更新 playwright.config.ts**

`webServer.env` 追加：

```ts
AIHOME_USAGE_CCSWITCH_DB: path.join(e2eSyncRoot, '..', '.e2e-usage', 'cc-switch.db'),
AIHOME_USAGE_CLAUDE_DIR: path.join(e2eSyncRoot, '..', '.e2e-usage', 'claude-projects'),
AIHOME_USAGE_CODEX_DIR: path.join(e2eSyncRoot, '..', '.e2e-usage', 'codex-sessions'),
AIHOME_USAGE_OPENCODE_DB: path.join(e2eSyncRoot, '..', '.e2e-usage', 'opencode.db'),
AIHOME_USAGE_HERMES_DB: path.join(e2eSyncRoot, '..', '.e2e-usage', 'hermes.db'),
```

> 注：`.e2e-usage` 在 `e2e/` 下、`.e2e-sync` 同级；用 `path.join(root, '.e2e-usage', ...)` 更直白——实现时以 root 为准。

- [ ] **Step 4: 更新 01-navigation.spec.ts**

- 标题改为 `'top nav has 5 navigation links'`，在 agents 断言后加：

```ts
await expect(page.locator(selectors.nav.usage)).toBeVisible();
```

- 新增用例：

```ts
test('Usage nav link navigates to /usage', async ({ page }) => {
  await page.goto('/board');
  await page.locator(selectors.nav.usage).click();
  await expect(page).toHaveURL(/\/usage/);
  await expect(page.locator('main h1')).toContainText('Usage');
});
```

- [ ] **Step 5: 写 09-usage.spec.ts**

```ts
import { test, expect } from '@playwright/test';
import { selectors } from '../helpers/selectors';

test.describe('Usage Aggregator', () => {
  test('isolation guard: dev server must use .e2e-usage fixture paths', async ({ request }) => {
    const res = await request.get('/api/usage/sources');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const cc = data.sources.find((s: { id: string }) => s.id === 'cc-switch');
    expect(cc.message).toContain('.e2e-usage');
  });

  test('page renders overview, kline, stats, table from fixtures', async ({ page }) => {
    await page.goto('/usage');
    await expect(page.locator(selectors.usage.overview)).toBeVisible();
    await expect(page.locator(selectors.usage.klineChart)).toBeVisible();
    await expect(page.locator(selectors.usage.stats)).toBeVisible();
    await expect(page.locator(selectors.usage.table)).toBeVisible();
    const today = await page.locator(selectors.usage.overviewToday).innerText();
    expect(today).not.toBe('$0.00');
  });

  test('API aggregates multi-source events', async ({ request }) => {
    const res = await request.get('/api/usage/events?range=24h&source=all&dimension=cost');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.totals.requests).toBeGreaterThanOrEqual(4);
    expect(data.stats.bySource.length).toBeGreaterThanOrEqual(4);
    expect(data.sourceStatus.find((s: { id: string }) => s.id === 'openclaw').status).toBe('not-supported');
  });

  test('source filter narrows data', async ({ page }) => {
    await page.goto('/usage');
    await page.locator(selectors.usage.sourceClaude).click();
    await expect(page.locator(selectors.usage.table)).toContainText('claude');
  });

  test('rescan flow refreshes data', async ({ page }) => {
    await page.goto('/usage');
    await page.locator(selectors.usage.rescan).click();
    await expect(page.locator(selectors.usage.rescan)).toBeEnabled({ timeout: 20_000 });
    await expect(page.locator(selectors.usage.overview)).toBeVisible();
  });
});
```

> 注：`toBeEnabled` 断言 rescan 完成（按钮从 disabled 恢复）。

- [ ] **Step 6: 运行 e2e**

Run: `npm run test:e2e`
Expected: 全部通过（含 01-navigation 5 链接、09-usage 5 用例）。

- [ ] **Step 7: lint + commit**

Run: `npm run lint`
Expected: 0 warnings。

```bash
git add e2e/global-setup.ts playwright.config.ts e2e/helpers/selectors.ts e2e/tests/01-navigation.spec.ts e2e/tests/09-usage.spec.ts
git commit -m "test(usage): add e2e fixtures and usage spec"
```

---

### Task 16: 文档与仓库收尾

**Files:**
- Modify: `README.md`（功能列表加 Usage 聚合看板；脚本表说明）
- Modify: `CHANGELOG.md`（新条目 v0.2.0 usage aggregator）
- 外部仓库：`Justin-Ju-0413/ccswitch-usage-widget` README 重定向（用 `gh`）

- [ ] **Step 1: README 功能加 Usage**

在 README 功能列表加入一行（英文、与现有格式一致）：

```markdown
- **Usage dashboard** — aggregate spend & token K-line across CC Switch, Claude Code, Codex, opencode, and hermes; local-only, incremental indexer.
```

- [ ] **Step 2: CHANGELOG 加条目**

在 `CHANGELOG.md` 顶部加：

```markdown
## [0.2.0] - 2026-08-05

### Added
- Usage dashboard (`/usage`): multi-source spend aggregator with K-line chart, stat charts, and collapsible usage table (CC Switch, Claude Code, Codex, opencode, hermes).
- Incremental local indexer with checkpoint + dedupe (cache at `~/.aihome/usage-cache.db`).
```

- [ ] **Step 3: ccswitch-usage-widget 重定向**

```bash
gh repo view Justin-Ju-0413/ccswitch-usage-widget --json nameWithOwner
```

- 先本地克隆或直接用 `gh api` 更新该仓库 README.md 顶部（`git` 操作保留原历史），README 首行改为：

```markdown
> **Moved:** TokenTicker has been merged into [AIHome](https://github.com/Justin-Ju-0413/aihome) as the multi-source Usage dashboard. This repository is archived; no new features will be added here.
```

并更新 description（`gh repo edit Justin-Ju-0413/ccswitch-usage-widget --description 'Merged into AIHome usage dashboard — see Justin-Ju-0413/aihome. Archived.'`）。

- [ ] **Step 4: 全量验证**

Run: `npm run lint && npm run test && npm run build`
Expected: 全绿；`npm run test:e2e` 亦全绿。

- [ ] **Step 5: Commit + push**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: usage aggregator release notes and README"
git push
```

---

## 自审记录

**Spec 覆盖对照**：五源适配器（T4–8）✓；openclaw 预留（T9 registry + sources 路由 not-supported）✓；增量索引器 + 断点 + 去重（T3, T9）✓；定价策略 cc-switch 表优先 + 内置回退（T2）✓；K 线 OHLC + 6 档时间 + 30d（T10, T13）✓；统计图表/表格 + 阈值色（T10, T14）✓；单源失败隔离（T9 catch per-source）✓；5 分钟 stale 后台索引（T9 indexIfStale）✓；E2E 五区块 + 筛选 + rescan + 空态（T15）✓；README/CHANGELOG + 旧仓库重定向（T16）✓；测试沿用 vitest/playwright（T2–T15）✓。

**已知取舍**（已在 spec 范围内明确）：
- codex 无 cost 字段 → 定价表计算（T6）。
- claude 新格式 usage 在 `message.usage`（已验证），旧格式在顶层（兼容处理）。
- K 线空桶跳过（稀疏数据下不画 0 值蜡烛）。
- opencode/hermes 为每会话粒度（上游数据只有这个粒度）。
