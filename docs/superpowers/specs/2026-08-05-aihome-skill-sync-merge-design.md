# AIHome 与 skill-sync 合并设计（Design Doc）

> 2026-08-05。目标：将 skill-sync（跨端技能同步工具）的功能并入 AIHome（本地 AI 技能/Agent 可视化工作台），合成为一个软件。本文档为 M1 里程碑设计；M2（桌面双交付）仅作规划不作实现范围。

## 1. 背景与目标

**现状**：
- **AIHome**（Next.js 16 / React 19 / TypeScript，MIT）：本地可视化工作台。扫描 `AGENTS.md` / `SKILL.md`，提供看板、关系图、列表/详情、工作区设置。v0.1.x 收口：91 个 e2e 全绿，lint/tsc/build 干净。API 兼容边界：现有 `/api/*` 成功响应结构。
- **skill-sync**（Python 3.8+ 零依赖 CLI + HTTP 仪表盘）：跨 opencode / claude / codex / hermes 四端同步 `SKILL.md` 技能。核心：校验和、冲突检测（同名不同内容保留 `name@端` 双份）、多端遍历 collect/push、幂等、自动 git commit、dry-run。v0.1.0 已发布三平台桌面版（PyInstaller）。

**决策（已与用户确认）**：
1. AIHome 为产品主体；skill-sync 功能成为其「同步」模块
2. 同步核心用 TypeScript 重写进 AIHome；skill-sync 仓库冻结存档
3. 交付形态：Web 工作台为主，桌面双交付列入后置里程碑
4. 首个里程碑（M1）：同步核心 + 同步页，纯 Web

## 2. 产品形态与数据布局

AIHome = 一个软件做四件事：看（看板/图谱/列表）、改（Markdown 编辑）、管（扫描/分组/健康）、同步（跨端 collect/push/冲突）。

**代码组织**：唯一代码库 = `aihome` 仓库。同步核心迁入 `src/lib/sync/`。`skill-sync` 仓库冻结：README 顶部注明「已合并入 AIHome」，不再发版（已发布产物保持可用）。

**数据布局**：
- 中心同步仓库迁移到 `~/.aihome/repo/`（git 仓库，含 `common/` 技能本体 + `metadata.json` 机器可读清单 + `MANIFEST.md` 人类可读清单）——替代原 `~/skill-sync`
- 端配置存 `~/.aihome/sync-config.json`：默认四端（opencode/claude/codex/hermes），路径可在设置页增删改
- 迁移：AIHome 启动/同步页首次访问时检测旧 `~/skill-sync` 存在 → 一次性复制 `common/` + `metadata.json` + `MANIFEST.md` 到 `~/.aihome/repo/`，保留原目录不动，UI 提示用户可手动删除
- 端路径与中心仓库 `common/` 自动纳入 AIHome 扫描/可视化（复用现有 scanner 与 workspace config）

## 3. 架构与模块

技术栈沿用 AIHome 现有栈；同步核心纯 TS、零新增运行时依赖；git 操作通过 `child_process` 调用系统 git（与 Python 版行为一致）。

### 3.1 `src/lib/sync/` 模块（职责单一、可独立测试）

| 文件 | 职责 | 移植自 |
|---|---|---|
| `endpoints.ts` | 端定义（id/名称/路径）、`~/.aihome/sync-config.json` 读写、默认四端 | sync.py 常量区 |
| `checksum.ts` | 技能内容校验和（稳定哈希）、幂等判断（校验和相同跳过） | sync.py 校验和逻辑 |
| `conflicts.ts` | 同名不同内容冲突检测、`name@端` 双份保留策略、冲突标记技能不 push | sync.py 冲突逻辑 |
| `repo.ts` | 中心仓库定位 `~/.aihome/repo`、git add/commit（collect 后自动提交）、git 错误分类 | sync.py REPO_DIR + git 集成 |
| `sync-engine.ts` | collect/push/status 编排、多端遍历、dry-run、计数聚合 | sync.py 命令实现 |
| `migration.ts` | 旧 `~/skill-sync` 检测、一次性迁移、幂等（已迁移则跳过） | 新增 |

**行为约定**（与 Python 版一致）：
- 技能判定：目录含 `SKILL.md`
- 冲突：同名不同内容 → 保留 `name` 与 `name@来源端` 两份，不静默覆盖
- 幂等：校验和相同跳过；目标端目录不存在自动创建
- push 覆盖端上未收集的分歧版本；冲突标记技能不会被 push
- 无删除传播：不删除任何端上的技能

### 3.2 API 路由（新增，遵循现有 `/api/*` 边界风格）

| 路由 | 用途 |
|---|---|
| `GET /api/sync/status` | 各端状态聚合（技能数/新/不同/冲突）+ 中心仓库汇总 |
| `POST /api/sync/collect` | 四端 → 中心仓库（自动 git commit），支持 `?dryRun=true` |
| `POST /api/sync/push` | 中心仓库 → 四端（幂等），支持 `?dryRun=true` |
| `GET /api/sync/conflicts` | 冲突列表（技能名/来源端/路径） |
| `PUT /api/sync/endpoints` | 端配置读写（增删改路径） |

**错误处理**：git 失败分类返回结构化错误码（`GIT_MISSING` / `GIT_CONFLICT` / `GIT_PERMISSION` / `SYNC_IO`），UI 展示中文提示；写操作一律支持 dry-run 预览。

### 3.3 UI

- 顶部导航加「同步」页：状态面板（四端 + 中心仓库汇总：技能数/新/不同/冲突）+ collect/push 按钮（带 dry-run 预览）+ 冲突列表（可跳转技能详情）
- 设置页加「同步端点」区块（增删改端路径，默认四端）

### 3.4 测试

- `src/lib/sync/*.test.ts` 单测：移植 Python 62 测试要点（校验和、冲突、幂等、多端遍历、dry-run、endpoints 配置读写、migration 幂等）
- e2e：补「同步页状态展示 + collect 冒烟 + 冲突列表」用例
- 回归：现有 91 个 e2e 保持全绿，lint/tsc/build 干净

## 4. 里程碑

### M1（本次实现）
- `src/lib/sync/` 六个模块 + 单测
- `/api/sync/*` 五个路由 + 同步页 + 设置页端点区块
- 旧 `~/skill-sync` 数据一次性迁移（自动检测 + UI 提示）
- `skill-sync` 仓库冻结（README 加合并说明）
- 验收：同步页可见四端状态（当前 73 技能 / 1 冲突 / 4 端），collect/push 全流程可用，现有 e2e 不回归

### M2（后置，不在本次范围）
- 桌面壳评估：Tauri（体积小）vs Electron（栈熟悉）二选一
- `next build` + 桌面壳三平台打包；skill-sync v0.1.0 桌面版退役
- 双击即开，复用 M1 同步能力

> **M2 已落地（2026-08-14）**：Tauri 2 桌面壳 + 注册表 + 悬浮窗，见 `2026-08-10-aihome-desktop-design.md`。

## 5. 不做的事（YAGNI）

- 不做同步历史可视化、定时自动同步、远程协作
- 不改 skill-sync 已发布产物（保持可用到 AIHome 桌面版上线）
- 不做端配置的批量导入导出

## 6. 风险

| 风险 | 缓解 |
|---|---|
| TS 重写引入行为偏差 | 单测逐条移植 Python 62 测试要点；collect/push 用真实四端目录冒烟对比 |
| 迁移破坏存量数据 | 只复制不移动、幂等、保留原目录；迁移前校验目标目录为空 |
| git 依赖（未装/版本差异） | 错误码分类 + 中文提示；collect 失败不丢本地文件 |
| e2e 环境差异（真实 home 目录） | e2e 用临时 HOME/临时 `~/.aihome`，不触碰真实四端目录 |
