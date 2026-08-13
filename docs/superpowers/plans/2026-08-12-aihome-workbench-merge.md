# AIHome 合并 AI Workbench 实施计划（workbench v1 完整并入）

> **For agentic workers:** 按本计划逐任务执行，步骤用 checkbox（`- [ ]`）跟踪，每任务独立 commit。遵循 AIHome AGENTS.md（任务完成前跑 `npm test`）。

**Goal:** 将 ai-workbench（AI 平台收藏工作台 + 余额展示）完整并入 AIHome：`src/lib/workbench/` 核心逻辑 + `/api/workbench/*` 路由 + `/workbench` 页 + 设置页区块 + 单测/e2e，全量验收全绿；ai-workbench 仓库冻结。

**Architecture:** 与 skill-sync / file-visualizer 并入先例同模式。技术栈同版本零依赖变化；DB 落 `~/.aihome/workbench.db`（`AIHOME_WORKBENCH_DB` 覆盖）+ 旧库一次性拷贝迁移（`AIHOME_WORKBENCH_LEGACY_DB` 覆盖）。

**Precedent docs:** `docs/superpowers/specs/2026-08-12-aihome-workbench-merge-design.md`

---

### Task 0: 基线提交（已完成）

- [x] 审查 AIHome `feat/desktop-app` 未提交变更（5 modified + fv/console untracked），提交意图内文件，排除复制残留 `README 2.md`
- [x] commit `chore: commit pending file-visualizer console merge (fv runtime + /console page)`

---

### Task 1: `src/lib/workbench/` 搬迁 + env/paths 适配 + 数据迁移

**Files:**
- Create（拷贝自 `../ai-workbench/src/lib/workbench/`）: `types.ts`、`db.ts`、`crud.ts`、`seed.ts`、`service.ts`、`scheduler.ts`、`balance-view.ts`、`balance/{adapter,deepseek,openrouter,openai}.ts`
- Create（拷贝测试）: `db.test.ts`、`crud.test.ts`、`seed.test.ts`、`service.test.ts`、`../balance-view.test.ts` → `src/lib/balance-view.test.ts`（与 workbench 同路径，lib 根下）
- Modify: `db.ts`（DB 路径 + 迁移）、`balance/*.ts`（env 前缀）

**Interfaces:**
- Consumes: 无（纯搬迁）
- Produces: `openWorkbenchDb()`（`~/.aihome/workbench.db` + 旧库拷贝）、`AIHOME_WORKBENCH_*` env、5 个测试文件在 vitest include 内自动收集

- [x] **Step 1: 拷贝 lib 文件**

```bash
cd /Users/gstar/Documents/05-项目代码/AIHome
cp ../ai-workbench/src/lib/workbench/{types,db,crud,seed,service,scheduler}.ts src/lib/workbench/
cp ../ai-workbench/src/lib/workbench/balance/*.ts src/lib/workbench/balance/
cp ../ai-workbench/src/lib/balance-view.ts src/lib/balance-view.ts
cp ../ai-workbench/src/lib/workbench/{db,crud,seed,service}.test.ts src/lib/workbench/
cp ../ai-workbench/src/lib/balance-view.test.ts src/lib/balance-view.test.ts
```

- [x] **Step 2: db.ts 适配 AIHome paths 惯例**

```ts
// 参考 src/lib/fv/paths.ts 模式
export function workbenchDbPath(): string {
  return process.env.AIHOME_WORKBENCH_DB ?? path.join(os.homedir(), '.aihome', 'workbench.db');
}
export function legacyWorkbenchDbPath(): string {
  return process.env.AIHOME_WORKBENCH_LEGACY_DB ?? path.join(process.cwd(), '..', 'ai-workbench', 'data', 'workbench.db');
}
```

`open()` 内：目标不存在且 legacy 存在 → `copyFileSync`（幂等：目标已存在则跳过）。

- [x] **Step 3: balance 适配器 env 前缀重命名**

`WORKBENCH_DEEPSEEK_BASE_URL` → `AIHOME_WORKBENCH_DEEPSEEK_BASE_URL`（openrouter/openai 同理），模块级 const 保留（dev/e2e 进程启动前注入）。

- [x] **Step 4: 跑单测**

Run: `npx vitest run src/lib/workbench src/lib/balance-view.test.ts`
Expected: 37 passed（db 3 + crud 11 + seed 3 + service 5 + balance-view 5 + adapters 9 + balance 1）——注意 balance-view.test.ts 与 workbench 目录分隔符写法

- [x] **Step 5: lint + tsc**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 error（注意 AIHome src/ 下禁 `any`，workbench 代码已无 any）

- [x] **Step 6: Commit**

```bash
git add src/lib/workbench/ src/lib/balance-view.ts src/lib/balance-view.test.ts
git commit -m "feat(workbench): merge workbench core lib (sites/keys/balance) with aihome paths"
```

---

### Task 2: `/api/workbench/*` 路由（AIHome 错误处理风格）

**Files:**
- Create（拷贝自 `../ai-workbench/src/app/api/workbench/`，10 个 route.ts）

**Interfaces:**
- Consumes: Task 1 lib
- Produces: 完整 API，前端可直接调用

- [x] **Step 1: 拷贝路由**

```bash
cp -R ../ai-workbench/src/app/api/workbench/ src/app/api/workbench/
```

- [x] **Step 2: 错误处理对齐 AIHome 风格**

每个 catch 块：`console.error(...)` + 通用错误文案（不泄漏 `(e as Error).message` 到响应），状态码语义化（400 校验 / 404 未找到）。具体：
- `sites/route.ts` POST / `sites/[id]/route.ts` PUT：catch → `console.error('Failed to ...')` + `{ error: 'Failed to save site' }` 500 或保留 400（校验类用 400）
- `keys/route.ts` POST：同上
- 其余 GET/DELETE/POST 薄壳保持，补 `console.error`（如 settings PUT 失败）

- [x] **Step 3: 冒烟（dev 3200 与 AIHome 3000 不冲突，用 AIHome 端口）**

```bash
AIHOME_WORKBENCH_DB=/tmp/aihome-wb-smoke.db npm run dev &
sleep 3
curl -s http://localhost:3000/api/workbench/settings
curl -s http://localhost:3000/api/workbench/sites | head -c 200
kill %1
```

Expected: settings 默认值；sites 空（首启 seed 由 GET sites 空表触发，返回 22 项）

- [x] **Step 4: Commit**

```bash
git add src/app/api/workbench/
git commit -m "feat(workbench): merge /api/workbench routes with aihome error style"
```

---

### Task 3: `/workbench` 页面 + 组件（主题适配）+ TopNav

**Files:**
- Create（拷贝 + 主题适配）: `src/app/workbench/page.tsx`、`src/stores/workbench-store.ts`、`src/components/{platform-card,balance-badge,key-dialog,site-form-dialog,search-filter}.tsx`
- Modify: `src/components/layout/TopNav.tsx`

**Interfaces:**
- Consumes: Task 2 API
- Produces: `/workbench` 页（AIHome 视觉）

- [x] **Step 1: 拷贝页面/组件/store**

```bash
cp ../ai-workbench/src/app/page.tsx src/app/workbench/page.tsx
cp ../ai-workbench/src/stores/workbench-store.ts src/stores/
cp ../ai-workbench/src/components/{platform-card,balance-badge,key-dialog,site-form-dialog,search-filter}.tsx src/components/
```

- [x] **Step 2: 主题适配（AIHome primary 蓝）**

- `bg-indigo-600` → `bg-primary`；`hover:bg-indigo-700` → `hover:bg-primary/90`（或保持 hover:bg-primary）
- `text-indigo-*` → `text-primary`
- `border-gray-200` → `border-card-border`（卡片/表单边框）；卡片 `bg-white` 保留（AIHome 白卡片在浅蓝底）
- `text-gray-400/300` → `text-muted`（AIHome token）
- page.tsx：**移除页内「设置」链接**（设置已并入 AIHome /settings）；标题 `AI Workbench` → `Workbench`（保持 `AIHome` 品牌一致性，标题可保留 "AI Workbench" 作为功能名——选 `Workbench`）
- data-testid 全部保留（e2e 依赖）

- [x] **Step 3: TopNav 加项**

`navItems` 加 `{ href: '/workbench', label: 'WORKBENCH', testId: 'nav-workbench' }`（放 USAGE 后 / SYNC 前）。

- [x] **Step 4: 冒烟**

`npm run dev` 后访问 `/workbench`：内置清单分组渲染、搜索/筛选、打开按钮、弹窗。

- [x] **Step 5: 验证 + Commit**

```bash
npm run lint && npx tsc --noEmit
git add src/app/workbench/ src/stores/workbench-store.ts src/components/ src/components/layout/TopNav.tsx
git commit -m "feat(workbench): /workbench page with aihome theme + topnav entry"
```

---

### Task 4: 设置并入 AIHome `/settings`（Workbench 余额区块）

**Files:**
- Modify: `src/app/settings/page.tsx`（增量追加区块）

**Interfaces:**
- Consumes: `/api/workbench/settings`、`/api/workbench/balance/refresh-all`、`/api/workbench/keys/clear-all`、`/api/workbench/sites/restore-builtins`
- Produces: 设置页「Workbench 余额」区块（e2e data-testid 沿用 workbench 版：`settings-auto-refresh`、`settings-interval`、`btn-refresh-all`、`btn-clear-keys`、`btn-restore-builtins`、`settings-msg`）

- [x] **Step 1: 追加区块**

在现有区块（About / EndpointSettings 之前）插入「Workbench 余额」section：自动刷新 checkbox + 间隔 number、全部刷新 / 恢复内置清单 / 清除全部 key 按钮、结果 toast（sonner `toast.success/error`）或区块内 msg。**不动现有 296 行逻辑**。

- [x] **Step 2: 验证 + Commit**

```bash
npm run lint && npx tsc --noEmit
git add src/app/settings/page.tsx
git commit -m "feat(workbench): settings page workbench balance section"
```

---

### Task 5: 单测补全 + e2e 迁移

**Files:**
- Create: `src/lib/workbench/__tests__/api-routes.test.ts`（直测 10 个 handler，参考 `src/lib/usage/__tests__/api-routes.test.ts`）
- Create（拷贝）: `e2e/mock-balance-server.mjs`、`e2e/tests/workbench.spec.ts`
- Modify: `playwright.config.ts`（webServer 数组化 + env）、`.gitignore`（`e2e/.e2e-workbench/`）

**Interfaces:**
- Consumes: Task 2-4
- Produces: 全绿单测 + 全绿 e2e（原 9 spec + 新 workbench spec）

- [x] **Step 1: api-routes 测试**

按 usage 先例直测：`GET/POST /api/workbench/sites`、`PUT/DELETE sites/[id]`、`POST restore-builtins`、`GET/POST keys`、`PUT/DELETE keys/[id]`、`POST set-current/clear-all`、`POST balance/[keyId]`（stub BALANCE_ADAPTERS）、`GET/PUT settings`。tmp 目录 DB + `AIHOME_WORKBENCH_DB` env（照 workbench 单测 beforeEach 模式）。

- [x] **Step 2: e2e 拷贝 + 配置**

```bash
cp ../ai-workbench/e2e/mock-balance-server.mjs e2e/
cp ../ai-workbench/e2e/tests/workbench.spec.ts e2e/tests/
```

playwright.config.ts：`webServer` 单对象 → 数组：
1. mock 服务 `node e2e/mock-balance-server.mjs`（url `http://127.0.0.1:3210`，timeout 30s）
2. 原 dev server 对象，env 追加 `AIHOME_WORKBENCH_DB: e2e/.e2e-workbench/workbench.db`、`AIHOME_WORKBENCH_DEEPSEEK_BASE_URL: http://127.0.0.1:3210`、`AIHOME_WORKBENCH_OPENROUTER_BASE_URL: http://127.0.0.1:3210/api/v1`、`AIHOME_WORKBENCH_OPENAI_BASE_URL: http://127.0.0.1:3210`

global-setup 或 webServer env 保证 `.e2e-workbench/` 干净（AIHome global-setup 已有清理逻辑，确认覆盖或补充）。

e2e 用例适配：
- `workbench.spec.ts` 不变（testid 全保留；设置用例已走 `/settings` 页，data-testid 沿用）
- 注意 AIHome settings 页有多个区块，`settings-msg` testid 唯一性

- [x] **Step 3: 跑单测 + e2e**

Run: `npm test`（全量，含 AIHome 原有）+ `npm run test:e2e`
Expected: 原有测试 + workbench 全绿；e2e 原 9 spec + 新 5 用例全绿（workbench mock 不触网）

- [x] **Step 4: Commit**

```bash
git add src/lib/workbench/__tests__/ e2e/ playwright.config.ts .gitignore
git commit -m "test(workbench): api-routes unit tests + e2e with mock balance server"
```

---

### Task 6: ai-workbench 仓库冻结

**Files:**
- Modify: `../ai-workbench/README.md`（顶部加合并说明）

- [x] **Step 1: README 加冻结段落**

顶部加：「> 已合并入 AIHome（2026-08-12）。本仓库冻结存档，功能以 AIHome 的 `/workbench` 页为准。合并文档见 AIHome `docs/superpowers/specs/2026-08-12-aihome-workbench-merge-design.md`。」

- [x] **Step 2: Commit**

```bash
cd ../ai-workbench && git add README.md && git commit -m "docs: mark workbench merged into aihome (frozen)"
```

---

### Task 7: 最终验收

- [x] **Step 1: AIHome 全量验证**

```bash
npm run lint        # 0 error
npx tsc --noEmit    # 干净
npm run build       # 成功
npm test            # 全部通过（原 30+ + workbench 新增）
npm run test:e2e    # 全部通过（原 9 spec + workbench 5 用例）
```

- [x] **Step 2: 数据迁移验证**

```bash
rm -f ~/.aihome/workbench.db   # 模拟首次（注意：如已有真实数据先备份）
AIHOME_WORKBENCH_DB=/tmp/mig-test.db AIHOME_WORKBENCH_LEGACY_DB=../ai-workbench/data/workbench.db npm run dev &
curl -s http://localhost:3000/api/workbench/sites | python3 -c "...检查 key 是否迁移..."
```

Expected: 旧库 key 配置出现在新库（迁移幂等：二次启动不重复拷贝）。

- [x] **Step 3: 计划打勾 + 收尾**

```bash
git add docs/superpowers/plans/2026-08-12-aihome-workbench-merge.md
git status  # 确认无杂物（README 2.md 除外——提醒用户处理）
git commit -m "docs: workbench merge plan checkboxes complete"
```

---

## Self-Review 记录

- **Design 覆盖**：§2 数据布局✓(T1) · §3.1 lib✓(T1) · §3.2 API✓(T2) · §3.3 UI✓(T3-4) · §3.4 测试✓(T5) · §4 里程碑✓(T0-T7)
- **先例对齐**：skill-sync（spec/plan 文档、冻结存档、数据迁移幂等）、file-visualizer（legacy DB 迁移 env 覆盖）、usage（api-routes 直测 handler 模式）
- **不回归保证**：只新增文件；修改面最小化 = TopNav + settings + playwright.config + .gitignore；每次 commit 前 lint/tsc/test
- **占位符**：无 TBD；e2e 用例沿用 workbench 已验证的 5 用例，仅配置层适配
