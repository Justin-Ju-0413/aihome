# AIHome 统一 Agent 管理器（/agents 升级）实施计划

日期：2026-09-03 · 分支：`feat/agent-tools-manager`

## 背景与目标

`/agents` 现在只是本地 markdown agent 扫描器（`data/` 下的 `AGENTS.md`/`SKILL.md` 文件夹），
ChatGPT / Claude Desktop 这类本机 AI 应用完全不在管理范围内。本计划把它升级为统一的
「本机 AI 助理管理器」：

- 新增「AI 工具」分区（默认展示）：检测本机已安装的 5 个 AI 工具，卡片展示安装状态、
  版本、配置路径、当前 provider（与 vault 联动），支持打开应用/配置目录。
- 现有 markdown agent 扫描保留为「Markdown Agents」分区，行为不变。

v1 工具目录：claude-code（CLI）、codex（CLI）、opencode（CLI）、Claude Desktop（应用）、
ChatGPT Desktop（应用）。

## 关键设计决策

1. **vault 只读联动**：`/api/tools` 服务端合并 `getStatus()`（`@/lib/vault`）的 per-tool
   `activeProviderName / fileState / stale`；vault 锁定时 UI 显示锁定态并链到 `/vault`。
   provider 切换仍在 `/vault`，不复制该 UI。
2. **「打开」走服务端固定命令**：`POST /api/tools/open` 仅接受 `{ toolId }`，服务端映射
   固定命令（应用 `open -a Claude/ChatGPT`，CLI 用 Finder 打开配置目录）。不接受客户端路径，
   不加 Tauri capability（沿用 `sync/git.ts` 固定二进制惯例）。非 macOS 返回 501。
3. **检测只读**：`existsSync` + `execFile('which', [固定名])` + best-effort 版本
   （CLI `--version` 3s 超时；应用 `plutil` 读 Info.plist），进程内 60s TTL 缓存，
   `?refresh=1` 绕过。
4. **路径全部 env 可覆盖**（沿用 `AIHOME_VAULT_*` 惯例）：CLI 配置路径复用
   `AIHOME_VAULT_*_CONFIG`；目录与桌面应用路径新增 `AIHOME_TOOLS_*` 变量。e2e 永不碰真实数据。

## 任务清单

### 1. 计划文档
- [x] 创建本计划文档并随做随勾。

### 2. 检测库 `src/lib/tools.ts`
- [x] `InstalledTool` / `ToolEntryId` / `ToolProviderInfo` 类型。
- [x] `TOOL_CATALOG`（5 项，env 覆盖：`AIHOME_TOOLS_CLAUDE_DIR`、`AIHOME_TOOLS_CODEX_DIR`、
  `AIHOME_TOOLS_OPENCODE_DIR`、`AIHOME_TOOLS_CLAUDE_DESKTOP_APP`、`AIHOME_TOOLS_CHATGPT_APP`、
  `AIHOME_TOOLS_CLAUDE_DESKTOP_CONFIG`；CLI 配置路径复用 `AIHOME_VAULT_*_CONFIG`）。
- [x] `detectTools({ refresh? })`：目录/二进制检测 + 版本探测 + vault status 合并 + TTL 缓存。
- [x] `openTool`：固定命令表 + `spawn` detached。
- [x] 单测 `src/lib/__tests__/tools.test.ts`：tmpdir + env 重定向 + mock `child_process`；
  覆盖 CLI/应用检测、未安装、版本失败 best-effort、TTL 缓存、vault 锁定合并、open 命令映射。

### 3. API 路由
- [x] `src/app/api/tools/route.ts`：GET（`?refresh=1`），裸数组响应（对齐 `/api/agents`），
  错误走 `api-response.ts` 契约。
- [x] `src/app/api/tools/open/route.ts`：POST `{ toolId }`；未知 id 404、非 macOS 501。
- [x] 路由单测 `src/lib/__tests__/tools-routes.test.ts`（直接调用 handler + `NextRequest`，
  mock `child_process`）。

### 4. i18n
- [x] 新建 `src/lib/i18n/dicts/tools.en.ts`（base）+ `tools.zh.ts`（严格对齐），`tools.*` 前缀。
- [x] 在 `src/lib/i18n/dicts/index.ts` 注册。

### 5. UI（`/agents`）
- [x] `src/app/agents/page.tsx`：header 保留标题，新增分区 tab（默认 `tools`），
  `data-testid="agents-section-tabs" / agents-tab-tools / agents-tab-markdown`。
- [x] 抽取 `src/components/agents/MarkdownAgentsSection.tsx`：现有搜索/全文/视图切换/重扫 +
  网格/列表逻辑原样迁移（含 store 接线），补 `agents-rescan` testid。
- [x] 新增 `src/components/agents/InstalledToolsSection.tsx`：拉取 `/api/tools`，卡片
  （图标、类型徽章、安装状态、版本、配置路径、provider 徽章 / vault 锁定态 + `/vault` 链接、
  打开按钮），`data-testid="tools-card"`；`?refresh=1` 重检按钮。
- [x] 详情页 `agents/[id]` 不动。

### 6. e2e
- [x] `playwright.config.ts` env 块补 `AIHOME_TOOLS_*` 重定向到 `e2e/.e2e-sync/tools/`。
- [x] 新 spec `e2e/tests/13-agents-tools.spec.ts`：默认工具分区 + 5 卡片结构、tab 往返切换
  （仅断言结构，不断言真实安装状态）。
- [x] `e2e/tests/04-agents-list.spec.ts`：加 `beforeEach` 点击 markdown 分区（默认分区变更
  的适配）；rescan 定位改用 `agents-rescan` testid。

### 7. 质量门禁与收尾
- [x] `npm test` 全绿。
- [x] `npm run lint` 全绿。
- [x] `npx tsc --noEmit` 全绿。
- [x] 跑 agents 相关 e2e（04 + 13 + 01-navigation）全绿。
- [x] 提交（`git status` 核对，不带入工作区里既有的 `layout.tsx` 改动与 3 个 " 2" Finder 副本）
  + PR 到 main。

## 风险与边界

- vault 锁定时 `/api/tools` 的 provider 字段为锁定态——UI 明示而非静默。
- `which`/版本探测在测试环境的不确定性：单测 mock；e2e 只断言结构。
- Windows/Linux：检测可运行，`open` 动作返回 501；本项目桌面壳仅 macOS（dmg）。
