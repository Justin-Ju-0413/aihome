# Spec: 扫描增量缓存（Scan Cache）

> 路线来源：`docs/v0.3-roadmap.md` P0-1。日期 2026-08-08。

## Objective

`GET /api/agents` 每次全量重扫所有工作区文件（`scanner.scanDirectories` 递归 readdir + readFile + stat），agent 多/文件多时接口变慢。本次为扫描加增量缓存：文件未变更时直接复用上次解析产物，二次请求延迟从 O(全部文件) 降到 O(变更文件)。

**用户**：本地 Agent 工作台使用者（个人）。默认工作区 `data/`，可配置多路径。

**成功标准**：
- 二次扫描（无文件变更）命中缓存，走 `readFile`/parse 的文件数为 0。
- 文件变更后缓存自动失效并重扫该文件；新增/删除文件目录级失效。
- 现有 85 单测 + 109 e2e 全绿，无回归。
- 缓存不落在仓库里（不进 git）。

## Assumptions（请纠正，否则按此推进）

1. 缓存**内存级**：单进程内二次扫描命中，不做磁盘持久化。首次全量扫描成本可接受，重点消灭高频二次请求。（已确认）
2. 每个文件用 `(mtimeMs, size)` 做指纹；同 mtime+size 视为未变更。Windows/极端毫秒精度下的碰撞风险在单用户本地工具上可接受。
3. `countAssociatedFiles`（scripts/references/assets/rules 子目录文件数）是多级目录，本次先缓存该目录下的 **直接** 统计（复用现有递归逻辑，但按目录 key 缓存），明细目录 mtime 变化时该 key 失效。不做全树 diff。
4. 缓存层独立 `src/lib/scan-cache.ts`，不侵入 parser/scanner 领域逻辑；`scanner.ts` 暴露一个带缓存入口（新增 export 或参数），API 路由默认走缓存。
5. CLAUDE.md 合并、依赖关系解析是纯内存第二遍，不在缓存范围内。

## Tech Stack / Commands

- TypeScript（ESM）、Next.js 16、vitest（`src/lib/**` 单测）、playwright e2e。
- 命令：`npm test`（vitest run）、`npm run lint`、`npx tsc --noEmit`、`npm run build`、`npm run test:e2e`。

## Project Structure

- `src/lib/scan-cache.ts`（新增）：指纹 + 复用逻辑，纯 TS 无 Next/Node 依赖可单测。
- `src/lib/scanner.ts`：改 `scanDirectory` 内部在读文件前查缓存；新增可选 `useCache` 或 `scanStatus` 返回命中统计。
- `src/lib/scanner.ts` 导出类型 `ScanCacheStats { filesChecked, cacheHits, cacheMisses }`。
- `src/lib/file-utils.ts`：如涉及目录指纹辅助则加小函数。
- `src/app/api/agents/route.ts`：`scanDirectories(config.paths, { cache: true })`。统计仅进 `ScanResult`，不加 HTTP 响应头（已确认）。
- 单测 `src/lib/__tests__/scan-cache.test.ts`、`scanner.test.ts`（新增）；e2e 已有覆盖刷新流程。

## Code Style

沿用仓库现状：纯函数、绝无名中间变量堆叠、early return、`node:` 导入顺序、无语义哨兵。示例：

```ts
export interface ScanFingerprint {
  mtimeMs: number;
  size: number;
}

export function fingerprintFor(stat: Stats): ScanFingerprint {
  return { mtimeMs: stat.mtimeMs, size: stat.size };
}
```

## Testing Strategy

- 单测（vitest，`src/lib/__tests__/`）：
  - 指纹命中：同 mtime+size 返回 cached。
  - 失次：mtime/size 任一变更注入。使用 `mkdtemp` + 定时构造文件，**本地时间戳**。
  - 目录统计失效：往 scripts/ references/ 等加文件后重扫 count 更新。
  - 全内存缓存：`scanDirectories` 两次调用，第二次 reads=0（新 API 断言）。
- e2e（已有）：保留现有用倒、改文件后刷新用例，确保不回归。
- 时间规则：用本地 `new Date` / 直接构造 mtime 数值，不用 `Date.UTC`。

## Boundaries

- Always：每次改完跑 `npm test`；缓存目录写入遵循路径沙箱（落在 workspace 内 or `data/cache/`）；lint/tsc/build 干净。
- Ask first：**引入磁盘持久化 JSON 缓存**（已确认不做）；改 `limited else scanner` 公开签名破坏现有调用；加 npm 依赖。
- Never：不碰 `.worktrees/`；不提交缓存结果；不删测试。

## Open Questions

1. ✅ 已确认：内存级缓存，不做磁盘持久化。
2. ✅ 已确认：统计只进 `ScanResult`，不加 HTTP 响应头。