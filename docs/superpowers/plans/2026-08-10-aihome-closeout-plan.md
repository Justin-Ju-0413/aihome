# AIHome Desktop Closeout (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 设计文档：`docs/superpowers/specs/2026-08-10-aihome-desktop-design.md`（§6 P3）

**Goal:** 收尾发布：旧仓库归档标注、版本 v0.3.0、文档与截图、环境清理。

**Architecture:** 全部是文档/版本/环境操作，无功能代码。三个 GATE（需用户确认）：归档仓库、删空目录、清理 skillhub 本地目录（可选）。

## Global Constraints

- 破坏性操作（GitHub archive、`rm` 空目录、删除本地目录）执行前必须用户确认
- 版本号统一 v0.3.0：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`CHANGELOG.md`
- 现有测试全绿后才算收尾完成
- 提交风格：`chore: ...` / `docs: ...`

---

### Task 1: 旧仓库归档（GATE — 需用户确认）

**Files:** 无（GitHub 远端操作 + skillhub 本地 README）

- [x] **Step 1: 向用户确认归档**（2026-08-14 用户确认：两个仓库均归档）

确认项：
1. GitHub `Justin-Ju-0413/skillhub` → Archive（只读冻结）
2. GitHub `Justin-Ju-0413/ccswitch-usage-widget` → Archive（只读冻结）

**等用户确认后才操作。**（gh CLI：`gh repo archive Justin-Ju-0413/skillhub`）

- [x] **Step 2: skillhub 本地 README 加归档标注**

在 `~/Documents/05-项目代码/skillhub/README.md` 顶部加：
```markdown
> **归档**：功能已并入 [AIHome](https://github.com/Justin-Ju-0413/aihome)（技能注册表 `~/.aihome/registry.db` + symlink 分发 + doctor）。本仓库只读保留。
```

ccswitch-usage-widget 的 `~/Documents/05-项目代码/ccswitch-usage-widget/README.md` 顶部加：
```markdown
> **归档**：用量可视化已并入 [AIHome](https://github.com/Justin-Ju-0413/aihome) usage dashboard；桌面悬浮窗由 AIHome 桌面版实现。本仓库只读保留。
```

- [x] **Step 3: 提交（两个独立仓库各自提交；GitHub 已 archive 冻结，标注 commit 仅存本地，无法 push）**

```bash
git -C ~/Documents/05-项目代码/skillhub add README.md
git -C ~/Documents/05-项目代码/skillhub commit -m "docs: archive notice — merged into AIHome"
git -C ~/Documents/05-项目代码/ccswitch-usage-widget add README.md
git -C ~/Documents/05-项目代码/ccswitch-usage-widget commit -m "docs: archive notice — merged into AIHome"
```

---

### Task 2: 版本 v0.3.0 + CHANGELOG + README

**Files:**
- Modify: `package.json`（0.2.0 → 0.3.0）
- Modify: `src-tauri/Cargo.toml`（version 0.3.0）
- Modify: `src-tauri/tauri.conf.json`（version 0.3.0）
- Modify: `CHANGELOG.md`
- Modify: `README.md`（桌面版章节）

- [x] **Step 1: 版本号同步**（perfection 0.1 已做）

`package.json` `"version": "0.2.0"` → `"0.3.0"`
`src-tauri/Cargo.toml` `version = "0.3.0"`（Task 已设）
`src-tauri/tauri.conf.json` `"version": "0.3.0"`（Task 已设）

- [x] **Step 2: CHANGELOG 加条目**（perfection 0.1 已做）

CHANGELOG.md 顶部加：
```markdown
## [0.3.0] - 2026-08-10

### Added
- Tauri 2 桌面壳：双击运行 .dmg，主窗口加载本地服务（127.0.0.1:3010），托盘菜单，开机自启
- 技能注册表（skillhub 并入）：SKILL.md 单源 + symlink 分发到 Claude Code / Codex / WorkBuddy，冲突保护，doctor 健康检查与修复
- 桌面悬浮窗（TokenTicker 回归）：置顶透明 K 线窗口，30s 刷新，托盘开关
- `/api/health` 健康路由；`npm run build:standalone` 构建脚本

### Changed
- 同步体系：git 四端同步（既有）与 symlink 注册表（新增）并存
```

- [x] **Step 3: README 加桌面版章节**

在 Features 之后加：
```markdown
## Desktop app / 桌面版

```bash
npm run build:standalone   # 产出 .next/standalone + 复制 static/public
bash scripts/smoke-desktop.sh  # 打包 .dmg + 冒烟验证
```

打包产物在 `src-tauri/target/release/bundle/dmg/AIHome_0.3.0_*.dmg`，双击即用，无需 Node 环境。
桌面版 = 全部 web 功能 + 托盘菜单（显示/隐藏主窗口、悬浮窗开关、开机自启、退出）+ 悬浮窗（置顶用量 K 线）。
仅绑定 `127.0.0.1:3010`。
```

- [x] **Step 4: 截图**（perfection 4.3 已做）

打开 `http://127.0.0.1:3100/skills` 与 `http://127.0.0.1:3100/widget`，截图保存：
`docs/screenshots/registry.png`、`docs/screenshots/widget.png`
（人工目检截图内容正确后提交）

- [x] **Step 5: 验证 + Commit**（`npm test` / tsc / lint 全绿，closeout commit 见 git log）

Run: `npm run lint`、`npx tsc --noEmit`、`npm test`、`PORT=3100 npx playwright test`
Expected: 全绿

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md README.md docs/screenshots/
git commit -m "chore: v0.3.0 desktop release (docs + version bump)"
```

---

### Task 3: 环境清理 + 收尾文档（GATE — 需用户确认）

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-aihome-desktop-design.md`（标注已落地）
- Delete（确认后）: `src/app/api/usage/events 2/`、`src/app/api/usage/rescan 2/`、`src/app/api/usage/sources 2/`、`src/lib/usage/__tests__ 2/`、`src/lib/usage/sources 2/`（Aug 7 复制残留的空目录，git 不跟踪）

- [x] **Step 1: 确认删除空目录**（复查已不存在）

向用户确认后执行：
```bash
rmdir "src/app/api/usage/events 2" "src/app/api/usage/rescan 2" "src/app/api/usage/sources 2" "src/lib/usage/__tests__ 2" "src/lib/usage/sources 2"
```
（rmdir 只删空目录；若非空则列出内容再决定，不强制删）

- [x] **Step 2: spec 标注落地**

在 `docs/superpowers/specs/2026-08-10-aihome-desktop-design.md` 顶部加：
```markdown
> **状态：已实现（2026-08-10）**。实现计划：`docs/superpowers/plans/2026-08-10-aihome-desktop-shell-plan.md`（P0）、`-registry-plan*.md`（P1）、`-widget-plan.md`（P2）。M2（2026-08-05 sync 设计文档的桌面壳）已落地。
```

- [x] **Step 3: 2026-08-05 sync 设计文档标注**

`docs/superpowers/specs/2026-08-05-aihome-skill-sync-merge-design.md` 的 M2 段落后加：
```markdown
> **M2 已落地（2026-08-10）**：Tauri 2 桌面壳 + 注册表 + 悬浮窗，见 `2026-08-10-aihome-desktop-design.md`。
```

- [x] **Step 4: Windows 打包评估记录**

在 spec 的 P3 段落后追加：
```markdown
**Windows 评估（2026-08-10）**：Tauri 支持 Windows bundle；next-server 进程树清理需用 `taskkill /T /F /PID`；junction 逻辑保留在 sync-engine（Node fs.symlink 在 Windows 下对目录默认创建 junction，无需额外代码）。暂不在本机验证，交付 macOS .dmg。
```

- [x] **Step 5: Commit**（`docs: closeout — spec marks + README desktop + handoff notes`）

```bash
git add docs/superpowers/specs/
git commit -m "docs: closeout — spec status marks + Windows eval note + cleanup"
```

---

## P3 完成标准

- 两个旧仓库已 archive（用户确认后）；本地 README 有归档标注
- 版本/CHANGELOG/README/截图齐全
- 空目录已清理（用户确认后）
- 全量测试绿 + lint + tsc 干净
- 全局交接文档 `~/Documents/Default Project/docs/superpowers/implementation-notes.md` 更新本次会话检查点
