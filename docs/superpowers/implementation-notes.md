# AIHome Implementation Notes（会话交接）

> 跨会话开发检查点。每个会话结束更新「最近检查点」；遗留事项写入「已知遗留」。

## 最近检查点（2026-08-14 · closeout 收尾）

- **v0.3.0 全部落地**：perfection 计划（2026-08-13）Phase 0–4 全勾选，PR #12 合并到 main；PR #11 合并后桌面壳/注册表/悬浮窗/workbench/console 全部在 main。
- **closeout（P3）完成**：GitHub 归档 `Justin-Ju-0413/skillhub` + `Justin-Ju-0413/ccswitch-usage-widget`（`gh repo archive --yes`，2026-08-14）；两个仓库本地 README 加归档标注并 commit（本地领先 commit 未 push——仓库已只读冻结）。
- **本地归档**：`~/Documents/05-项目代码/_archive/` 现有 4 个仓库：`ai-workbench`、`ccswitch-usage-widget`（本次移入）、`file-visualizer`、`skillhub`。均只读保留，不再开发。
- **文档补齐**：AIHome README 加「Desktop app / 桌面版」章节；desktop-design spec 顶部加「状态：已实现」；sync-merge-design spec M2 段落加「M2 已落地」；desktop-design spec P3 加 Windows 评估记录。
- **原计划路径偏差**：closeout 计划引用的 `~/Documents/Default Project/docs/superpowers/implementation-notes.md` 不存在，交接文档落位本文件（repo 内 `docs/superpowers/implementation-notes.md`）。

## 已知遗留

- **runner-panel worktree**（`.worktrees/runner-panel/`）：用户遗留，功能已以 fv console 形态落地；不动、不 commit、不 prune。其计划 0/81 勾选（被 console 合并取代）。
- **AGENTS.md in-flight 段落**：2026-08-14 状态，closeout 完成后可按需追加一行说明（本次未改，避免噪音；下次大改动时顺手更新）。
- **桌面壳已知限制**：非优雅退出（如 `kill -9`）仍可能泄漏 next-server 子进程；SIGTERM/SIGINT 路径已加固（perfection 1.1）。
- **OpenClaw 适配器 schema 漂移风险**：适配器按当前 `cache_entries` / `model_capability_cache` 字段编写，OpenClaw 版本更新时需 fixtures 验证。
- **GitHub 归档恢复**：两仓库 archive 可随时 `gh repo unarchive` 恢复（仅管理员可操作）。
