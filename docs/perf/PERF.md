# Performance Baseline (P0)

> Generated `2026-08-19T18:52Z` · prod build `2488b10` · Playwright headless chromium, `--repeat 3` 中位数

## Measurement

```bash
npm run build
npm run start -- -p 3210 &
node scripts/measure-perf.mjs --base http://127.0.0.1:3210 --out docs/perf/baseline.json --repeat 3
```

## Baseline (median)

| route | FCP ms | load ms | transfer KB | JS KB | resources |
|---|---|---|---|---|---|
| / | 92 | 90 | 375 | 239 | 65 |
| /board | 88 | 87 | 375 | 239 | 65 |
| /graph | 76 | 88 | 454 | 321 | 66 |
| /agents | 72 | 78 | 381 | 239 | 71 |
| /agents/sample-navigator | 72 | **262** | **625** | **516** | 23 |
| /skills | 72 | 84 | 366 | 239 | 62 |
| /settings | 68 | 77 | 372 | 241 | 69 |
| /health | 72 | 84 | 369 | 241 | 64 |
| /usage | 72 | 81 | 375 | 239 | 63 |
| /console | 84 | 88 | **1063** | 186 | **250** |
| /workbench | 72 | 86 | 371 | 239 | 62 |
| /sync | 72 | 82 | 387 | 239 | 62 |
| /onboarding | 104 | 96 | 370 | 243 | 63 |

## 结论

- **共同壳层 ≈ 239KB JS / ~370KB 传输**（fcp <110ms，本地服务已很快）。
- **最大热点 1：agent 详情页 `/agents/[id]`** — 拖入 `@uiw/react-md-editor`（~1MB chunk），
  JS 516KB、load 262ms。**懒加载编辑器**是首攻点。
- **热点 2：`/graph`** — xyflow + dagre 321KB JS，可懒加载/降级。
- **热点 3：`/console`** — 250 个资源请求 / 1MB 传输：SSE + 文件树 + 多处 API 轮询，优化请求合并。
- 只读 API 无缓存头；`/` 是 `force-dynamic`；健康/用量/工作台等只读路由可加 SWR/缓存。

## 复测命令

```bash
node scripts/measure-perf.mjs --base http://127.0.0.1:3210 --out docs/perf/after.json --repeat 3
```

## After P2 (2026-08-20) — request-storm fix

`scripts/run-measure.sh`（每路由独立浏览器进程）重新度量：

| route | before transferKB | after transferKB | before res | after res | change |
|---|---|---|---|---|---|
| /board | 375 | 375 | 65 | 65 | — |
| /graph | 454 | 454 | 66 | 66 | — |
| /console | **1063** | **384** | **250** | **67** | **trans -64% / res -73%** |
| /others | ~370 | ~370 | ~63 | ~63 | — |

### P2 改了什么
- 根因修复 `/console` 请求风暴：页面 effect 依赖 `[store]`，而 zustand 每次 `set()`
  产生新 state 引用，`[store]` 恒变 → effect 无限重跑 → 同一 API 秒级 44 次请求。
  改为依赖稳定的 `useConsoleStore.getState()` + 空依赖/原始值 `activeTab`。
- 事件驱动刷新加**合并去抖**（`src/lib/fv/reload-coalesce.ts` + 4 单测）：
  积压事件批不再逐条触发刷新。
- 事件轮询按类型去重；tab 切换跳过首渲染避免双份请求。

### 尝试后撤销
- `@uiw/react-md-editor` 懒加载：本地实测无效——编辑器在默认 tab 常驻，
  localhost 下 1MB chunk 300ms 内即下载完，首屏 JS 总量未降（587→588KB）。
  撤销以避免加载闪烁与复杂度。详情页 1MB chunk 属该库固有体积，
  建议后续更换轻量编辑器（记入 TODO）。

## 复测命令

```bash
bash scripts/run-measure.sh --port 3211 --out docs/perf/after.json --repeat 3
```
