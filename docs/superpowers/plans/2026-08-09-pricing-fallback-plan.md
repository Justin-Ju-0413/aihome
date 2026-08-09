# 价格表五层回退 + 未知定价提示 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `src/lib/usage/pricing.ts` 增加五层定价回退（override > cc-switch DB > bundled > provider 前缀池 > unknown），并将"未知定价"以事件级标记透出到 UI 成本面板（徽标条 + 模型名）。

**Architecture:** `getPricing` 破坏性签名变更，返回 `{ pricing: ModelPricing | null, source: PricingSource }`；claude/codex 适配器把 `pricingSource` 戳到 `ScannedEvent` 上；`events` 表加 `pricing_source TEXT` 列（`PRAGMA user_version` V1→V2 迁移 + 存量回填）；`/api/usage/events` 响应新增 `unknownPricing` 聚合，页面顶部渲染提示徽标。

**Tech Stack:** TypeScript (ESM)、Next.js 16、`node:sqlite` (DatabaseSync)、vitest、playwright。

## Global Constraints

- 破坏性签名变更仅限 `getPricing`（本 spec 唯一允许）；调用点仅 indexer.ts、claude.ts/codex.ts 适配器、测试。
- 事件级标记：`UsageEvent.pricingSource?: PricingSource`；`PricingSource = 'override' | 'cc-switch' | 'bundled' | 'provider-prefix' | 'unknown'`。
- override JSON：`data/pricing-overrides.json`（`{ "model": { inputPerM, outputPerM, cacheReadPerM, cacheWritePerM } }`），每次索引时读；文件不存在或解析失败 → `null`（log 到 stderr），忽略。
- provider 前缀池静态写死 5 前缀（claude- / gpt- / deepseek- / glm- / gemini-），不拉网络。
- cc-switch / opencode / hermes 自带原生 cost（DB 列），不给这些事件戳 pricingSource；只有 claude / codex 走 pricing 链。
- 五层优先级：override > cc-switch > bundled > provider-prefix > unknown(cost=0)。
- 时间戳用本地 `new Date`，禁 `Date.UTC` 构造"现在"。
- 跑 `npm test`；lint / `npx tsc --noEmit` / `npm run build` 干净；e2e 用 `PORT=3100`。
- commit 只含意图内文件；每任务单独 commit。
- 不改 `route.ts` 现有响应结构（只增 `unknownPricing` 字段）。

---

### Task 1: pricing.ts — 五层回退核心 + 加载器

**Files:**
- Modify: `src/lib/usage/pricing.ts`
- Test: `src/lib/usage/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export type PricingSource = 'override' | 'cc-switch' | 'bundled' | 'provider-prefix' | 'unknown'`
  - `export interface PricingLookup { pricing: ModelPricing | null; source: PricingSource }`
  - `export const PROVIDER_FALLBACK_PRICING: Record<string, ModelPricing>`（5 前缀均价）
  - `export function loadPricingOverrides(overridesPath: string): Record<string, ModelPricing> | null`
  - `export function getPricing(model: string, ccSwitchPricing?: Record<string, ModelPricing> | null, overrides?: Record<string, ModelPricing> | null): PricingLookup`

- [x] **Step 1: 写失败测试（扩展 pricing.test.ts）**

先更新 imports：
```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { calculateCost, getPricing, loadCcSwitchPricing, loadPricingOverrides, BUNDLED_PRICING, PROVIDER_FALLBACK_PRICING } from '../pricing';
import type { ModelPricing } from '../pricing';
import { tmpDir, rmTmp } from './fixtures';
```

在文件末尾追加（tmpDir 顶层声明）：
```ts
const pdir = tmpDir('pricing-');
afterAll(() => rmTmp(pdir));

describe('getPricing five-tier fallback', () => {
  const cc: Record<string, ModelPricing> = { 'glm-5.2': p };
  const overrides: Record<string, ModelPricing> = {
    'claude-opus-4-7': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 0.1, cacheWritePerM: 0.2 },
  };
  it('override wins over everything', () => {
    expect(getPricing('claude-opus-4-7', cc, overrides)).toEqual({
      pricing: overrides['claude-opus-4-7'], source: 'override',
    });
  });
  it('cc-switch beats bundled and prefix', () => {
    expect(getPricing('glm-5.2', cc)).toEqual({ pricing: p, source: 'cc-switch' });
  });
  it('bundled beats provider-prefix', () => {
    const r = getPricing('gpt-4o', null);
    expect(r.source).toBe('bundled');
    expect(r.pricing).toEqual(BUNDLED_PRICING['gpt-4o']);
  });
  it('provider prefix matches unmapped family', () => {
    const r = getPricing('claude-4-x', null);
    expect(r.source).toBe('provider-prefix');
    expect(r.pricing).toEqual(PROVIDER_FALLBACK_PRICING['claude-']);
  });
  it('gemini prefix matches', () => {
    expect(getPricing('gemini-2.5-pro', null).source).toBe('provider-prefix');
  });
  it('no match -> unknown with null pricing', () => {
    expect(getPricing('no-such-model', null)).toEqual({ pricing: null, source: 'unknown' });
  });
  it('no overrides arg skips override tier', () => {
    expect(getPricing('claude-opus-4-7', null).source).toBe('bundled');
  });
});

describe('loadPricingOverrides', () => {
  it('returns null when file missing', () => {
    expect(loadPricingOverrides('/nonexistent/overrides.json')).toBeNull();
  });
  it('parses valid file', () => {
    const f = path.join(pdir, 'overrides.json');
    fs.writeFileSync(f, JSON.stringify({
      'my-model': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 0.1, cacheWritePerM: 0.2 },
    }));
    expect(loadPricingOverrides(f)).toEqual({
      'my-model': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 0.1, cacheWritePerM: 0.2 },
    });
  });
  it('returns null and logs for invalid JSON', () => {
    const f = path.join(pdir, 'bad.json');
    fs.writeFileSync(f, '{nope');
    expect(loadPricingOverrides(f)).toBeNull();
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/usage/__tests__/pricing.test.ts`
Expected: FAIL（TS 报 `PROVIDER_FALLBACK_PRICING` / `loadPricingOverrides` 未导出；`getPricing` 返回对象而非 `ModelPricing`）

- [x] **Step 3: 实现 pricing.ts**

修改顶部 import：
```ts
import { existsSync, readFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
```

在 `ModelPricing` 之后新增：
```ts
export type PricingSource = 'override' | 'cc-switch' | 'bundled' | 'provider-prefix' | 'unknown';

export interface PricingLookup {
  pricing: ModelPricing | null;
  source: PricingSource;
}
```

在 `BUNDLED_PRICING` 之后新增（行业均价，可调）：
```ts
export const PROVIDER_FALLBACK_PRICING: Record<string, ModelPricing> = {
  'claude-': { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.4, cacheWritePerM: 5 },
  'gpt-': { inputPerM: 2.5, outputPerM: 10, cacheReadPerM: 1.25, cacheWritePerM: 2.5 },
  'deepseek-': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'glm-': { inputPerM: 0.6, outputPerM: 2.5, cacheReadPerM: 0.1, cacheWritePerM: 0.6 },
  'gemini-': { inputPerM: 0.7, outputPerM: 2.8, cacheReadPerM: 0.1, cacheWritePerM: 0.35 },
};
```

替换 `getPricing` 实现：
```ts
export function getPricing(
  model: string,
  ccSwitchPricing?: Record<string, ModelPricing> | null,
  overrides?: Record<string, ModelPricing> | null
): PricingLookup {
  if (overrides && overrides[model]) return { pricing: overrides[model], source: 'override' };
  if (ccSwitchPricing?.[model]) return { pricing: ccSwitchPricing[model], source: 'cc-switch' };
  if (BUNDLED_PRICING[model]) return { pricing: BUNDLED_PRICING[model], source: 'bundled' };
  for (const [prefix, pricing] of Object.entries(PROVIDER_FALLBACK_PRICING)) {
    if (model.startsWith(prefix)) return { pricing, source: 'provider-prefix' };
  }
  return { pricing: null, source: 'unknown' };
}
```

文件末尾追加加载器：
```ts
export function loadPricingOverrides(overridesPath: string): Record<string, ModelPricing> | null {
  if (!existsSync(overridesPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(overridesPath, 'utf-8')) as Record<string, unknown>;
    const out: Record<string, ModelPricing> = {};
    for (const [model, v] of Object.entries(raw)) {
      const o = v as Record<string, unknown>;
      const inputPerM = Number(o.inputPerM);
      const outputPerM = Number(o.outputPerM);
      if (!Number.isFinite(inputPerM) || !Number.isFinite(outputPerM)) continue;
      out[model] = {
        inputPerM,
        outputPerM,
        cacheReadPerM: Number(o.cacheReadPerM) || 0,
        cacheWritePerM: Number(o.cacheWritePerM) || 0,
      };
    }
    return out;
  } catch (err) {
    console.error(`pricing overrides parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/usage/__tests__/pricing.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/usage/pricing.ts src/lib/usage/__tests__/pricing.test.ts
git commit -m "feat(usage): pricing five-tier fallback with PricingSource"
```

---

### Task 2: types.ts + claude/codex 适配器 — 事件级 pricingSource 标记

**Files:**
- Modify: `src/lib/usage/types.ts`
- Modify: `src/lib/usage/sources/index.ts`
- Modify: `src/lib/usage/sources/claude.ts`
- Modify: `src/lib/usage/sources/codex.ts`
- Test: `src/lib/usage/__tests__/claude.test.ts`, `src/lib/usage/__tests__/codex.test.ts`

**Interfaces:**
- Consumes: `PricingLookup` / `PricingSource`（Task 1）
- Produces: `UsageEvent.pricingSource?: PricingSource`；`Adapter = (path, cp, pricing: (m) => PricingLookup) => AdapterScan`

- [x] **Step 1: 写失败测试（改 claude.test.ts / codex.test.ts）**

claude.test.ts：
```ts
import { BUNDLED_PRICING, type PricingLookup } from '../pricing';

const lookup = (m: string): PricingLookup => {
  const pricing = BUNDLED_PRICING[m] ?? null;
  return { pricing, source: pricing ? 'bundled' : 'unknown' };
};
```
把 4 处 `(m) => BUNDLED_PRICING[m] ?? null` 替换为 `lookup`；并在第一个用例 `events[0]` 断言后追加：
```ts
expect(events[0].pricingSource).toBe('bundled');
expect(events[1].pricingSource).toBe('bundled');
```

codex.test.ts：同样加 `lookup`，把 2 处替换；在第一个用例追加：
```ts
expect(events[0].pricingSource).toBe('bundled');
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/usage/__tests__/claude.test.ts src/lib/usage/__tests__/codex.test.ts`
Expected: FAIL（TS：类型不匹配，`pricingProvider` 期望 `(m) => ModelPricing | null`）

- [x] **Step 3: 实现**

types.ts：顶部加 import，`UsageEvent` 加字段：
```ts
import type { PricingSource } from './pricing';

export interface UsageEvent {
  ...
  costUsd: number;
  pricingSource?: PricingSource;
  ...
}
```

sources/index.ts：Adapter 类型改为：
```ts
import type { PricingLookup } from '../pricing';

type Adapter = (path: string, cp: Checkpoint, pricing: (m: string) => PricingLookup) => AdapterScan;
```

claude.ts：
```ts
import { calculateCost, type PricingLookup } from '../pricing';
...
export function scanClaude(
  dir: string,
  cp: Checkpoint,
  pricingProvider: (model: string) => PricingLookup
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
```
事件构造处：
```ts
const lookup = pricingProvider(model);
...
costUsd: lookup.pricing ? calculateCost({ input, output, cacheRead, cacheWrite }, lookup.pricing) : 0,
pricingSource: lookup.source,
```

codex.ts：
```ts
import { calculateCost, type PricingLookup } from '../pricing';
...
export function scanCodex(
  dir: string,
  cp: Checkpoint,
  pricingProvider: (model: string) => PricingLookup
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
```
事件构造处：
```ts
const lookup = pricingProvider(currentModel);
...
costUsd: lookup.pricing
  ? calculateCost({ input, output, cacheRead, cacheWrite: 0 }, lookup.pricing)
  : 0,
pricingSource: lookup.source,
```

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/usage/__tests__/claude.test.ts src/lib/usage/__tests__/codex.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/usage/types.ts src/lib/usage/sources/index.ts src/lib/usage/sources/claude.ts src/lib/usage/sources/codex.ts src/lib/usage/__tests__/claude.test.ts src/lib/usage/__tests__/codex.test.ts
git commit -m "feat(usage): stamp pricingSource on claude/codex events"
```

---

### Task 3: cache.ts — pricing_source 列迁移 + 读写 + 存量回填

**Files:**
- Modify: `src/lib/usage/cache.ts`
- Test: `src/lib/usage/__tests__/cache.test.ts`

**Interfaces:**
- Consumes: `PricingSource`（Task 1）
- Produces:
  - `UsageCache.open` 内嵌 `PRAGMA user_version` 迁移（V1→V2）
  - `UsageCache.backfillPricingSource(resolve: (model: string) => PricingSource | null): number`

- [x] **Step 1: 写失败测试（cache.test.ts 追加）**

在文件顶部 import 补 `DatabaseSync`：
```ts
import { DatabaseSync } from 'node:sqlite';
```

追加用例：
```ts
it('migrates v1 schema adding pricing_source column', () => {
  const p = path.join(dir, 'v1.db');
  const raw = new DatabaseSync(p);
  raw.exec(`CREATE TABLE events (
    raw_id TEXT NOT NULL, source TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL, cache_write_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL, latency_ms INTEGER, session_id TEXT, ts INTEGER NOT NULL,
    PRIMARY KEY (source, raw_id));
    PRAGMA user_version = 1;`);
  raw.prepare(`INSERT INTO events (raw_id, source, provider, model, input_tokens, output_tokens,
    cache_read_tokens, cache_write_tokens, cost_usd, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('r1', 'claude', 'claude-code', 'unknown-model-x', 10, 5, 0, 0, 0, 1000);
  raw.close();
  const c = UsageCache.open(p);
  try {
    const rows = c.queryEvents(['claude'], 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].pricingSource).toBeUndefined();
    const n = c.backfillPricingSource((m) => (m === 'unknown-model-x' ? 'unknown' : null));
    expect(n).toBe(1);
    const after = c.queryEvents(['claude'], 0);
    expect(after[0].pricingSource).toBe('unknown');
  } finally {
    c.close();
  }
});

it('writes and reads pricing_source on insert/query', () => {
  cache.insertEvents([{ ...ev('ps', 5000), pricingSource: 'bundled' }]);
  const rows = cache.queryEvents(['cc-switch'], 0);
  const hit = rows.find((r) => r.rawId === 'ps');
  expect(hit?.pricingSource).toBe('bundled');
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/usage/__tests__/cache.test.ts`
Expected: FAIL（`backfillPricingSource` 不存在；迁移未加列导致 query 报错或无 pricingSource）

- [x] **Step 3: 实现 cache.ts**

顶部 import 补 `PricingSource`：
```ts
import type { ActiveUsageSource, Checkpoint, ScannedEvent } from './types';
import type { PricingSource } from './pricing';
```

SCHEMA 的 `events` 表加一列（`session_id TEXT,` 之后）：
```ts
  pricing_source TEXT,
```

`open()` 内 `db.exec(SCHEMA)` 后调迁移：
```ts
  static open(cachePath: string): UsageCache {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const db = new DatabaseSync(cachePath);
    db.exec(SCHEMA);
    migrateSchema(db);
    return new UsageCache(db);
  }
```

模块级迁移函数：
```ts
function migrateSchema(db: DatabaseSync): void {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (user_version >= 2) return;
  const cols = db.prepare('PRAGMA table_info(events)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'pricing_source')) {
    db.exec('ALTER TABLE events ADD COLUMN pricing_source TEXT');
  }
  db.exec('PRAGMA user_version = 2');
}
```

`insertEvents`：INSERT 加列 + 参数：
```ts
    const stmt = this.db.prepare(
      `INSERT INTO events (raw_id, source, provider, model, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, session_id, ts, pricing_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source, raw_id) DO NOTHING`
    );
    ...
      for (const e of events) {
        const r = stmt.run(e.rawId, e.source, e.provider, e.model, e.inputTokens, e.outputTokens,
          e.cacheReadTokens, e.cacheWriteTokens, e.costUsd,
          e.latencyMs ?? null, e.sessionId ?? null, e.timestamp, e.pricingSource ?? null);
        inserted += Number(r.changes);
      }
```

`queryEvents`：SELECT 加列 + 映射：
```ts
        `SELECT raw_id, source, provider, model, input_tokens, output_tokens,
                cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, session_id, ts, pricing_source
         FROM events WHERE source IN (${placeholders}) AND ts >= ?
         ORDER BY ts`
```
映射对象加：
```ts
      pricingSource: r.pricing_source == null ? undefined : (r.pricing_source as PricingSource),
```

新增回填方法（放在 `countEvents` 之前）：
```ts
  backfillPricingSource(resolve: (model: string) => PricingSource | null): number {
    const rows = this.db
      .prepare(`SELECT DISTINCT model FROM events WHERE pricing_source IS NULL AND source IN ('claude','codex')`)
      .all() as Array<{ model: string }>;
    const update = this.db.prepare(
      `UPDATE events SET pricing_source = ? WHERE model = ? AND pricing_source IS NULL AND source IN ('claude','codex')`
    );
    let n = 0;
    for (const { model } of rows) {
      const src = resolve(model);
      if (!src) continue;
      n += Number(update.run(src, model).changes);
    }
    return n;
  }
```

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/usage/__tests__/cache.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/usage/cache.ts src/lib/usage/__tests__/cache.test.ts
git commit -m "feat(usage): pricing_source column migration + backfill"
```

---

### Task 4: indexer.ts + paths.ts — override 读取 + 回填接线

**Files:**
- Modify: `src/lib/usage/paths.ts`
- Modify: `src/lib/usage/indexer.ts`
- Modify: `src/lib/usage/__tests__/indexer.test.ts`
- Modify: `src/lib/usage/__tests__/api-routes.test.ts`（仅 env 补 override 路径）

**Interfaces:**
- Consumes: `loadPricingOverrides`（Task 1）、`UsageCache.backfillPricingSource`（Task 3）
- Produces: `pricingOverridesPath()`（paths.ts），`runIndex` 每次读 override + 开库后回填

- [x] **Step 1: 写失败测试（indexer.test.ts 追加）**

在文件顶部 import 补：
```ts
import * as fs from 'fs';
```

追加用例（含辅助 mkdir）：
```ts
it('stamps pricingSource on claude events, tolerates missing override file', () => {
  const claudeDir = path.join(dir, 'claude-ps');
  fs.mkdirSync(path.join(claudeDir, 'proj'), { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, 'proj', 's1.jsonl'),
    JSON.stringify({ type: 'assistant', uuid: 'u1', timestamp: '2026-08-01T10:00:00.000Z',
      message: { model: 'glm-5.2', usage: { input_tokens: 100, output_tokens: 50 } } }) + '\n' +
    JSON.stringify({ type: 'assistant', uuid: 'u2', timestamp: '2026-08-01T11:00:00.000Z',
      message: { model: 'mystery-x', usage: { input_tokens: 10, output_tokens: 5 } } }) + '\n'
  );
  const prev = { ...process.env };
  Object.assign(process.env, {
    AIHOME_USAGE_CCSWITCH_DB: path.join(dir, 'no-cc.db'),
    AIHOME_USAGE_OPENCODE_DB: path.join(dir, 'no-oc.db'),
    AIHOME_USAGE_CLAUDE_DIR: claudeDir,
    AIHOME_USAGE_CODEX_DIR: path.join(dir, 'no-codex'),
    AIHOME_USAGE_HERMES_DB: path.join(dir, 'no-hermes.db'),
    AIHOME_USAGE_CACHE: path.join(dir, 'cache-ps.db'),
    AIHOME_USAGE_PRICING_OVERRIDES: path.join(dir, 'no-overrides.json'),
  });
  try {
    runIndex(['claude']);
    const cache = UsageCache.open(path.join(dir, 'cache-ps.db'));
    try {
      const rows = cache.queryEvents(['claude'], 0);
      const byModel = Object.fromEntries(rows.map((r) => [r.model, r]));
      expect(byModel['glm-5.2'].pricingSource).toBe('bundled');
      expect(byModel['mystery-x'].pricingSource).toBe('unknown');
      expect(byModel['mystery-x'].costUsd).toBe(0);
    } finally {
      cache.close();
    }
  } finally {
    process.env = prev;
  }
});
```

（indexer.test.ts 顶部需 `import { UsageCache } from '../cache';`）

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/usage/__tests__/indexer.test.ts`
Expected: FAIL（`pricingOverridesPath` 未导出或 pricingSource 未写入）

- [x] **Step 3: 实现**

paths.ts 追加：
```ts
export function pricingOverridesPath(): string {
  return process.env.AIHOME_USAGE_PRICING_OVERRIDES ?? path.join(process.cwd(), 'data', 'pricing-overrides.json');
}
```

indexer.ts：import 补 `loadPricingOverrides` 和 `pricingOverridesPath`，`runIndex` 顶部：
```ts
import { loadCcSwitchPricing, getPricing, loadPricingOverrides } from './pricing';
import { USAGE_SOURCE_PATHS, usageCachePath, pricingOverridesPath } from './paths';
...
export function runIndex(only?: ActiveUsageSource[]): IndexResult {
  const cache = UsageCache.open(usageCachePath());
  const ccPricing = loadCcSwitchPricing(USAGE_SOURCE_PATHS['cc-switch']());
  const overrides = loadPricingOverrides(pricingOverridesPath());
  const pricing = (model: string) => getPricing(model, ccPricing, overrides);
  cache.backfillPricingSource((m) => pricing(m).source);
  const targets = only && only.length > 0 ? only : ACTIVE_SOURCES;
```

- [x] **Step 4: 运行全部单测确认通过（含现有 indexer/api-routes）**

先给 indexer.test.ts 和 api-routes.test.ts 的每个 `Object.assign(process.env, {...})` 追加一行：
```ts
    AIHOME_USAGE_PRICING_OVERRIDES: path.join(dir, 'no-overrides.json'),
```
（indexer.test.ts 3 处 env 块、api-routes.test.ts 1 处 beforeAll env 块；确保测试不读用户真实 override 文件，hermetic。）

Run: `npx vitest run src/lib/usage/`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/usage/paths.ts src/lib/usage/indexer.ts src/lib/usage/__tests__/indexer.test.ts src/lib/usage/__tests__/api-routes.test.ts
git commit -m "feat(usage): read pricing overrides + backfill on index"
```

---

### Task 5: aggregate.ts + route — unknownPricing 聚合

**Files:**
- Modify: `src/lib/usage/aggregate.ts`
- Modify: `src/app/api/usage/events/route.ts`
- Test: `src/lib/usage/__tests__/aggregate.test.ts`, `src/lib/usage/__tests__/api-routes.test.ts`

**Interfaces:**
- Consumes: `UsageEvent.pricingSource`（Task 2）
- Produces: `groupUnknownPricing(events): Array<{ source: string; model: string; count: number }>`；route 响应 `unknownPricing`

- [x] **Step 1: 写失败测试**

aggregate.test.ts 追加：
```ts
import { ..., groupUnknownPricing } from '../aggregate';

describe('groupUnknownPricing', () => {
  it('groups unknown-priced events by source+model', () => {
    const e1 = { ...ev(NOW, 0, 10, 'claude', 'mystery-x'), pricingSource: 'unknown' as const };
    const e2 = { ...ev(NOW, 0, 20, 'claude', 'mystery-x'), pricingSource: 'unknown' as const };
    const e3 = { ...ev(NOW, 1, 10, 'cc-switch', 'm1'), pricingSource: undefined };
    const out = groupUnknownPricing([e1, e2, e3]);
    expect(out).toEqual([{ source: 'claude', model: 'mystery-x', count: 2 }]);
  });
});
```

api-routes.test.ts 第一个用例 `events: aggregates cached data` 内加断言：
```ts
    expect(data.unknownPricing).toBeDefined();
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/usage/__tests__/aggregate.test.ts src/lib/usage/__tests__/api-routes.test.ts`
Expected: FAIL（`groupUnknownPricing` 未导出 / `unknownPricing` 不在响应）

- [x] **Step 3: 实现**

aggregate.ts 文件末尾追加：
```ts
export function groupUnknownPricing(events: UsageEvent[]): Array<{ source: string; model: string; count: number }> {
  const map = new Map<string, { source: string; model: string; count: number }>();
  for (const e of events) {
    if (e.pricingSource !== 'unknown') continue;
    const key = `${e.source}\u0000${e.model}`;
    const g = map.get(key) ?? { source: e.source, model: e.model, count: 0 };
    g.count += 1;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
```

route.ts：import 补 `groupUnknownPricing`，响应对象加字段：
```ts
import {
  buildKline, bucketMsForRange, rangeMs, totalsFor, groupBySource, groupByModel,
  byDay, buildTable, groupUnknownPricing, USAGE_RANGES,
  type UsageRange, type UsageDimension,
} from '@/lib/usage/aggregate';
...
      return NextResponse.json({
        totals: totalsFor(totalsEvents, now),
        kline: buildKline(windowEvents, bucketMs, dimension),
        stats: {
          byDay: byDay(windowEvents),
          bySource: groupBySource(windowEvents),
          topModels: groupByModel(windowEvents),
        },
        unknownPricing: groupUnknownPricing(windowEvents),
        table: buildTable(cache.queryEvents(sources, totalsSince), now),
        sourceStatus,
      });
```

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/usage/__tests__/aggregate.test.ts src/lib/usage/__tests__/api-routes.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/usage/aggregate.ts src/app/api/usage/events/route.ts src/lib/usage/__tests__/aggregate.test.ts src/lib/usage/__tests__/api-routes.test.ts
git commit -m "feat(usage): expose unknownPricing aggregation in events API"
```

---

### Task 6: UI 徽标条（page.tsx）

**Files:**
- Modify: `src/app/usage/page.tsx`

**Interfaces:**
- Consumes: 响应新增 `unknownPricing` 字段（Task 5）
- Produces: `[data-testid="usage-unknown-pricing"]` 提示条（有 unknown 时渲染，含模型名 + 来源 + 次数）

- [x] **Step 1: 更新 EventsResponse 类型 + 渲染徽标**

`EventsResponse` 接口加：
```ts
  unknownPricing: Array<{ source: string; model: string; count: number }>;
```

在 source-status 块之后、`<OverviewCards>` 之前加：
```tsx
          {data.unknownPricing.length > 0 && (
            <div
              data-testid="usage-unknown-pricing"
              className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              未知定价：{data.unknownPricing
                .map((u) => `${u.model}（${u.source} ×${u.count}）`)
                .join('、')}
            </div>
          )}
```

- [x] **Step 2: 验证构建**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS（无 TS 报错、build 成功）

- [x] **Step 3: Commit**

```bash
git add src/app/usage/page.tsx
git commit -m "feat(usage): unknown-pricing banner on usage page"
```

---

### Task 7: e2e 未知模型 fixture + 面板提示 + 全量验证

**Files:**
- Modify: `e2e/global-setup.ts`
- Modify: `e2e/tests/09-usage.spec.ts`

**Interfaces:**
- Consumes: UI 徽标 `[data-testid="usage-unknown-pricing"]`（Task 6）
- Produces: e2e fixture 含未知模型 claude 事件；新用例断言徽标可见

- [x] **Step 1: 写失败 e2e 用例 + fixture**

e2e/global-setup.ts：claude s1.jsonl 改为两行（追加未知模型事件，用模板串）：
```ts
  fs.writeFileSync(
    path.join(usageRoot, 'claude-projects', 'proj', 's1.jsonl'),
    JSON.stringify({
      type: 'assistant', uuid: 'u1', timestamp: new Date(safeMs).toISOString(),
      message: { model: 'glm-5.2', usage: { input_tokens: 500, output_tokens: 100,
        cache_read_input_tokens: 50, cache_creation_input_tokens: 10 } },
    }) + '\n' +
    JSON.stringify({
      type: 'assistant', uuid: 'u2', timestamp: new Date(safeMs).toISOString(),
      message: { model: 'mystery-model-x99', usage: { input_tokens: 40, output_tokens: 20 } },
    }) + '\n'
  );
```

09-usage.spec.ts 追加用例：
```ts
  test('unknown pricing banner shown for unmapped models', async ({ page }) => {
    await page.goto('/usage');
    await expect(page.locator('[data-testid="usage-unknown-pricing"]')).toBeVisible();
    await expect(page.locator('[data-testid="usage-unknown-pricing"]')).toContainText('mystery-model-x99');
  });
```

- [x] **Step 2: 跑 usage e2e 确认新用例通过**

Run: `PORT=3100 npx playwright test e2e/tests/09-usage.spec.ts`
Expected: PASS（含新用例；存量用例不回归）

- [x] **Step 3: 全量验证**

Run:
```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
PORT=3100 npx playwright test
```
Expected: 单测全绿（原 98 + 新增）、lint 0 error、tsc 干净、build 成功、e2e 全绿（109 + 1）

- [x] **Step 4: 更新 plan 勾选 + commit**

在计划文档本任务所有 step 前打勾（含本 step），然后：
```bash
git add e2e/global-setup.ts e2e/tests/09-usage.spec.ts docs/superpowers/plans/2026-08-09-pricing-fallback-plan.md
git commit -m "test(usage): e2e unknown-pricing banner"
```

---

## Self-Review

**Spec coverage:**
- 五层回退链 → Task 1（getPricing 顺序断言逐层覆盖）
- 未知模型 `pricingSource:'unknown'` + cost 0 → Task 1/2/4（mystery-x 断言 costUsd 0）
- UI 徽标含模型名 → Task 6（map 拼接 model/source/count）
- 存量回填按当前定价链 → Task 3（backfill 方法）+ Task 4（runIndex 接线）
- 98+109 全绿 → Task 7 Step 3 全量验证
- pricing 单测五层优先级 → Task 1；e2e 面板标记 → Task 7

**Placeholder scan:** 无 TBD/TODO；每步含具体代码。

**Type consistency:** `PricingLookup` / `PricingSource` 全链路一致；`groupUnknownPricing` 返回类型与 route 字段、page.tsx 类型、e2e 断言一致；`backfillPricingSource` 参数 `(m) => PricingSource | null` 与 indexer 闭包 `(m) => pricing(m).source` 匹配。

**已知边缘（记录，不阻塞）：** provider-prefix 的 `deepseek-` 前缀会把 `deepseek-v4-flash`（无 -free 后缀）纳入前缀池——符合 spec"行业均价"意图；如用户模型名恰好误匹配前缀，可在 override JSON 精准覆盖。
