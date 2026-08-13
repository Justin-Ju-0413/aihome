# AIHome 阶段完善计划（2026-08-13）

> 基于 2026-08-13 全量功能研究（页面/API/核心库/桌面壳/e2e 矩阵/规划全景）制定。
> 原则：**先还债（工程/可靠性/质量），再补功能（P1/P2），最后收尾（closeout）**。
> 每项独立交付、独立 commit；提交信息风格：`feat(...)` / `fix(...)` / `test(...)` / `docs(...)` / `chore(...)`。

## Global Constraints

- 破坏性操作（归档旧仓库、删文件）执行前必须用户确认
- 每次改动后：`npm test` + `npx tsc --noEmit` + `npm run lint` 全绿
- e2e 回归用 `PORT=3100`（Tauri 壳占 3010）；桌面冒烟 `bash scripts/smoke-desktop.sh`
- Rust 构建 PATH：`/opt/homebrew/opt/rustup/bin`（harness shell 不加载 .zshrc）

---

## Phase 0: 工程状态收口

- [x] **0.1 版本统一 0.3.0**
  - package.json `version: 0.2.0 → 0.3.0`
  - CHANGELOG 补 `[0.3.0]` 条目（桌面壳 / workbench 并入 / console-fv 并入 / API key 加密）
  - 验收：`/api/health` 返回 version 0.3.0；`npm test` 全绿
  - Commit: `chore: bump version 0.2.0 -> 0.3.0`

- [ ] **0.2 推送分支 + 提 PR**
  - 推送 `feat/desktop-app`（23+ commits）到 GitHub，`gh pr create` 合并到 main
  - 验收：PR 可合并；描述含功能摘要与测试状态
  - Commit: 无（仅推送/PR）

- [x] **0.3 AGENTS.md 更新 in-flight 状态**
  - fv/console、workbench 已合并；desktop 壳 P0 完成；runner-panel 标注"以 fv console 形态落地"
  - Commit: `docs: refresh in-flight work status in AGENTS.md`

- [x] **0.4 磁盘健康脚本**
  - package.json 加 `clean:rust`（`cargo clean --manifest-path src-tauri/Cargo.toml` + 提示删除 standalone-resources 与旧 dmg）
  - 验收：运行后 target 释放 ~10G；说明写进脚本注释
  - Commit: `chore: add clean:rust script for disk reclamation`

## Phase 1: 可靠性与安全加固

- [x] **1.1 SIGTERM/SIGINT 加固**（桌面壳）
  - server.rs/lib.rs：libc 信号处理——收到 SIGTERM/SIGINT 时先 `stop_next_server()` 再退出（正常退出路径 ExitRequested|Exit 已覆盖，补信号路径；macOS 注销/关机/`kill` 场景）
  - 验收：`kill <app-pid>` 后 `lsof -ti :3010` 无残留；smoke 脚本加 SIGTERM 场景检查
  - Commit: `fix(desktop): clean up next-server on SIGTERM/SIGINT`

- [x] **1.2 usage-cache 保留策略 + 异步化**（v0.3 P0-3）
  - 保留：`USAGE_RETENTION_DAYS`（默认 90，可配置 7/30/90），启动 + 每轮索引后 `DELETE FROM events WHERE ts < now-90d`
  - 异步：`indexIfStale` 改 fire-and-forget——先读缓存立即返回，后台重索引；响应头 `x-stale: true`；同源并发约束
  - 顺手：`ts` 单列索引
  - 验收：单测覆盖清理边界（本地时间构造过期数据）；e2e 断言 stale 响应头 + 清理后 count 收缩
  - Commit: `feat(usage): retention policy + async reindex (v0.3 P0-3)`

- [x] **1.3 定价五层回退**（v0.3 P0-2）
  - `getPricing` 五层：ccSwitch → BUNDLED → provider 前缀 fallback 池（claude-*/gpt-*/deepseek-*/glm-*/gemini-* 行业均价）→ unknown 标记 → `data/pricing-override.json` 用户覆盖（最高优先级）
  - 前端成本面板对 unknown 显示"未知定价"提示
  - 验收：pricing 单测覆盖五层优先级；e2e 面板未知模型提示
  - Commit: `feat(usage): pricing fallback pool + override + unknown marker (v0.3 P0-2)`

## Phase 2: 测试补强

- [x] **2.1 安全核心单测**：path-security（`..`/符号链接/unicode 边界）、workspace-config 校验、parser 解析
- [x] **2.2 fv 高风险模块**：orchestrator（调度/fallback 链，mock adapter）、agent-runner（stream-json 解析/快照 diff）、process-registry（崩溃恢复）、file-watcher（chokidar 事件）
- [x] **2.3 usage 薄适配器**：codex/hermes 适配器 fixtures 补齐
- 验收：新测试全绿；覆盖率明显提升
- Commit: `test(...)` 逐项独立

## Phase 3: 功能补齐

- [x] **3.1 P1 技能注册表**（按 `2026-08-10-aihome-registry-plan{,-part2,-part3}.md` 逐任务执行并勾选）
  - skillhub 并入：`~/.aihome/registry.db` + symlink 分发 claude-code/codex/workbuddy + 冲突保护 + doctor
- [x] **3.2 P2 TokenTicker widget**（按 `2026-08-10-aihome-widget-plan.md`）
  - `/widget` 页 + kline.ts + Tauri 置顶透明窗 + 托盘开关
- 验收：对应 plan 全部勾选；e2e/冒烟覆盖

## Phase 4: 体验完善 + closeout

- [x] **4.1 OpenClaw 用量源**（v0.3 P1-4，依赖 1.2 的索引健康）
- [x] **4.2 roadmap P1-5 体验项**：全文搜索、健康面板、首用引导、只读演示（按 v0.3-roadmap 描述）
- [x] **4.3 closeout**：版本同步（0.1 已含）、截图补全、**旧仓库归档**（file-visualizer / ai-workbench / skillhub → `_archive/`，2026-08-14 用户确认）

---

## 完成标准

- Phase 0–4 全部 checkbox 勾选
- 单测/e2e/lint/tsc 全绿；桌面冒烟全 PASS
- 无已知遗留缺陷（SIGTERM 泄漏、版本不一致等）
