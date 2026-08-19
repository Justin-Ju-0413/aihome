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
