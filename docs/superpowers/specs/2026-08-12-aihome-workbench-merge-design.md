# AIHome 与 AI Workbench 合并设计（Design Doc）

> 2026-08-12。目标：将 AI Workbench（AI 平台聚合工作台——收藏、分类、一键打开、余额展示）并入 AIHome，合成为一个软件。按 skill-sync / file-visualizer 并入先例执行：核心 TS 迁入 `src/lib/`、路由走 `/api/*` 风格、仓库冻结存档。

## 1. 背景与目标

**现状**：
- **AIHome**（Next.js 16 / React 19 / zustand 5 / Tailwind 4 / node:sqlite）：本地优先的 agent 生态可视化工作台（看板/图谱/用量/控制台/同步/设置）。数据全部落 `~/.aihome/`，env 前缀 `AIHOME_*`。
- **AI Workbench**（`ai-workbench` 独立仓库，同技术栈 v1 已完成）：收藏 22 个内置 + 自定义 AI 平台站点，分类/搜索/一键打开，DeepSeek / OpenRouter / OpenAI 余额展示（服务端发查询、key 只存服务端、掩码回显），单测 37 + e2e 5 全绿。

**决策（已与用户确认）**：
1. **完整合并**：lib + API + `/workbench` 页 + 设置 + 单测 + e2e 全量迁入 AIHome
2. AIHome 为产品主体；ai-workbench 仓库冻结存档（README 注明已合并）
3. 设置功能并入 AIHome 现有 `/settings` 页（新增区块，不动现有逻辑）
4. 已有 key 数据一次性迁移到 `~/.aihome/workbench.db`

## 2. 产品形态与数据布局

AIHome 新增第六个能力：**工作台**（AI 平台收藏 + 余额）。

**代码组织**：核心迁入 `AIHome/src/lib/workbench/`（与 fv/sync/usage 平级）。ai-workbench 仓库冻结：README 顶部注明「已合并入 AIHome」，不再维护。

**数据布局**：
- DB 文件 `~/.aihome/workbench.db`（env `AIHOME_WORKBENCH_DB` 可重定向，对齐 fv/usage 惯例）
- 迁移：首次打开时若 `~/.aihome/workbench.db` 不存在但旧库存在 → 一次性**拷贝**（保留旧库不动、幂等、env `AIHOME_WORKBENCH_LEGACY_DB` 覆盖旧路径，默认推断 `../ai-workbench/data/workbench.db`——与 fv 的 `VACUUM INTO` 迁移先例同模式）
- schema 沿用 workbench 的 `PRAGMA user_version` 迁移体系（与 AIHome 的 CREATE TABLE IF NOT EXISTS 风格并存，互不冲突；表名 sites/keys/settings 与 AIHome 其他库不同文件，无碰撞）

## 3. 架构与模块

技术栈与 AIHome 完全同版本（Next 16.2.7 / React 19.2.4 / zustand 5.0.14 / Tailwind 4 / node:sqlite / vitest / playwright），`@/*` 别名一致，零新增运行时依赖。

### 3.1 `src/lib/workbench/`（整体搬迁 + 适配）

| 文件 | 职责 | 适配点 |
|---|---|---|
| `types.ts` / `db.ts` | 类型 / node:sqlite + user_version 迁移 | DB 路径 → `AIHOME_WORKBENCH_DB`（默认 `~/.aihome/workbench.db`）+ 旧库拷贝迁移 |
| `crud.ts` | sites/keys/settings CRUD + 掩码 | 无 |
| `seed.ts` | 22 个内置平台清单 + 幂等恢复 | 无 |
| `balance/{adapter,deepseek,openrouter,openai}.ts` | 余额适配器 | base URL env → `AIHOME_WORKBENCH_*_BASE_URL` |
| `service.ts` / `scheduler.ts` | 查询编排（单飞）+ 自动刷新定时器 | 无 |
| `balance-view.ts` | 余额徽标文案纯函数 | 无 |

### 3.2 API 路由（`/api/workbench/*`，10 个）

sites CRUD + restore-builtins、keys CRUD + set-current + clear-all、balance/[keyId] + refresh-all、settings GET/PUT。错误处理对齐 AIHome 风格：try/catch + `console.error` + 通用文案 + 语义状态码（400/404），不泄漏内部异常消息。

### 3.3 UI

- **`/workbench` 页**：卡片网格（分类分组、搜索/筛选、一键打开、余额徽标、key 弹窗、站点表单），主题适配 AIHome（`bg-primary` 主色、`border-card-border`、白卡片浅蓝底视觉）
- **TopNav** 加 `WORKBENCH` 项（`nav-workbench`）
- **设置页**（`/settings`）追加「Workbench 余额」区块：自动刷新开关+间隔、全部刷新、清除全部 key（confirm）、恢复内置清单；sonner toast + lucide 风格

### 3.4 测试

- 单测：5 个 workbench 测试文件直接迁入（vitest include `src/lib/**/*.test.ts` 自动收集）+ 新增 `src/lib/workbench/__tests__/api-routes.test.ts`（直测 10 个 handler，参考 fv/usage 先例）
- e2e：`e2e/mock-balance-server.mjs`（3210）+ `e2e/tests/workbench.spec.ts`（5 用例）迁入，playwright.config webServer 数组化并注入 `AIHOME_WORKBENCH_*` env
- 回归：AIHome 现有单测 + 9 个 e2e spec 保持全绿，lint/tsc/build 干净

## 4. 里程碑（本次）

1. 基线：提交 AIHome 现有未提交 fv/console 工作（已完成）
2. `src/lib/workbench/` 搬迁 + env/paths 适配 + 数据迁移
3. `/api/workbench/*` 路由（AIHome 错误风格）
4. `/workbench` 页 + 组件 + TopNav
5. `/settings` 并入 Workbench 余额区块
6. 单测 + api-routes 测试 + e2e 迁移
7. ai-workbench README 冻结标注
8. 全量验收：AIHome lint/tsc/build/test/test:e2e 全绿

## 5. 不做的事（YAGNI）

- 不合并 usage 聚合器与 balance 语义（功能不同：本地用量统计 vs 平台余额；导航并存）
- 不搬 ai-workbench 的 e2e 独立 dev server 结构（AIHome 单一 webServer + mock 服务数组化）
- 不做 key 迁移的双向同步（只拷贝一次，旧库不动）
- 不改 AIHome 现有设置页结构（纯增量区块）

## 6. 风险

| 风险 | 缓解 |
|---|---|
| AIHome 现有测试回归 | 只新增文件；TopNav/settings/playwright.config 最小修改；全量回归验收 |
| 数据迁移破坏旧库 | 只拷贝不移动、幂等（目标已存在则跳过）、env 可覆盖 |
| workbench 设置页并入 296 行设置页出错 | 纯增量区块，不触碰现有逻辑 |
| 两套「用量/余额」语义混淆 | workbench 页与 usage 页分开；README 说明差异 |
| 端口冲突（workbench 3200 vs AIHome 3000） | AIHome 保持 3000；mock 服务 3210 独立 |
