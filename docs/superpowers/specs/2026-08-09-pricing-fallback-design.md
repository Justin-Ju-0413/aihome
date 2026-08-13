# Spec: 价格表扩展（五层回退 + 未知定价提示）

> 路线来源：`docs/v0.3-roadmap.md` P0-2。日期 2026-08-09。

## Objective

`src/lib/usage/pricing.ts` 的 `BUNDLED_PRICING` 只有 9 个模型，未知模型按 cost=0 静默计入，成本面板失真。本次为定价加**五层回退**（用户 override > cc-switch DB > bundled > provider 前缀池 > unknown），并把"未知定价"以**事件级标记**透出到 UI，面板显示提示而非静默 0。

**用户**：本地 AI 用量看板使用者（个人）。数据源 cc-switch/claude/codex/opencode/hermes。

**成功标准**：
- `getPricing` 五层回退链：override JSON > cc-switch DB > bundled > provider 前缀池 > null。
- 未知模型事件带 `pricingSource: 'unknown'`，cost 按 0 计；UI 成本面板显示"未知定价"提示（含模型名）。
- 存量 events 行一次性回填 pricing_source（按当前定价链推算，无感知）。
- 现有 98 单测 + 109 e2e 全绿（pricing 单测加未知模型五层优先级；e2e 面板对未知模型显示标记）。

## Assumptions（请纠正，否则按此推进）

1. **事件级标记 + DB 列**（用户已确认 2026-08-09）：`UsageEvent` 加可选 `pricingSource: PricingSource`，`events` 表加 `pricing_source TEXT` 列。新扫描写入；存量行启动/首次扫描时回填（`SELECT` 逐行按 model 查表）。
2. **override JSON 每次索引时读**（用户已确认）：`data/pricing-override.json`（`{ "model": { inputPerM, outputPerM, cacheReadPerM, cacheWritePerM } }`），最高优先级；文件不存在或解析失败 → 忽略（log 到 stderr）。
3. `getPricing` 返回 `{ pricing: ModelPricing | null, source: PricingSource }`（破坏性签名变更——这是本 spec 唯一允许的公开签名破坏，调用点仅有 indexer.ts 与测试）。
4. provider 前缀池是**静态行业均价**（5 前缀：claude-* / gpt-* / deepseek-* / glm-* / gemini-*），写死在 pricing.ts；不拉网络、不查 API。
5. 五层定义：`PricingSource = 'override' | 'cc-switch' | 'bundled' | 'provider-prefix' | 'unknown'`。
6. e2e 用 `PORT=3100`（存量 next-server 占 3000 且路由过期，见 P0-1 交接）。

## Tech Stack / Commands

- TypeScript（ESM）、Next.js 16、`node:sqlite`（DatabaseSync）、vitest、playwright。
- 命令：`npm test` / `npm run lint` / `npx tsc --noEmit` / `npm run build` / `PORT=3100 npx playwright test`。

## Project Structure

- `src/lib/usage/pricing.ts`（改）：
  - `export type PricingSource`（新）
  - `export const PROVIDER_FALLBACK_PRICING`（新：5 前缀 → 均价）
  - `export function loadPricingOverrides(overridesPath: string): Record<string, ModelPricing> | null`（新）
  - `getPricing(model, ccSwitchPricing?, overrides?)` → 改返回 `{ pricing, source }`；缺省第三参数 = 无 override 层
- `src/lib/usage/types.ts`（改）：`UsageEvent.pricingSource?: PricingSource`
- `src/lib/usage/cache.ts`（改）：SCHEMA 增 `pricing_source TEXT` 列 + `PRAGMA user_version` 迁移（V1→V2：ALTER TABLE ADD COLUMN + 存量回填）；`insertEvents`/`queryEvents` 读写新列
- `src/lib/usage/indexer.ts`（改）：`runIndex` 读 override JSON（`data/pricing-overrides.json`，每次索引时读）；`pricing` 闭包返回 source；扫描时给事件打标记
- `src/app/api/usage/events/route.ts`（改）：响应加 `unknownPricing: { source, model, count }[]`（FROM pricing_source='unknown'，range 内聚合）
- `src/app/usage/page.tsx` + 成本面板（改）：unknown 时显示"未知定价"徽标/提示
- 测试：`src/lib/usage/__tests__/pricing.test.ts`（五层优先级）、`cache.test.ts`（迁移+列读写）、`indexer.test.ts`（标记写入）、e2e `09-usage.spec.ts`（面板提示）

## Code Style

沿用仓库现状：纯函数、early return、`node:` 导入前缀、无语义哨兵、测试用真实文件/DB（mkdtemp）。时间戳本地 `new Date`，禁 `Date.UTC`。

## Testing Strategy

- 单测（vitest）：
  - pricing：override 优先 / cc-switch 优先 / bundled / provider 前缀（`claude-4-x` 命中池）/全 miss→unknown + cost 0；`pricingSource` 断言
  - cache：迁移后旧库含 pricing_source 列；回填正确；insertEvents 写新列；queryEvents 读新列
  - indexer：扫描后事件带 pricingSource；override 文件缺失不报错
- e2e：usage 页 fixtures 注入未知模型事件 → 面板"未知定价"可见；其余 109 用例不回归
- CI：lint+test+build（既有）

## Boundaries

- Always：跑 `npm test`；lint/tsc/build 干净；commit 只含意图内文件。
- Ask first：改 `scanDirectories` 等无关公开签名；加 npm 依赖；删除 pricing 测试。
- Never：写死用户密钥/路径；`Game` 无关改动；删 `e2e` 用例；改 `route.ts` 现有响应结构（只增字段）。

## Open Questions

1. UI 提示位置：成本面板顶部徽标条（推荐）还是表格行内标注？默认采纳推荐。
2. override 文件名 `pricing-overrides.json` 还是 roadmap 的 `pricing-override.json`？（统一取前者，doc 同步）