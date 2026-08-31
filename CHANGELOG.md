# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases use Semantic Versioning.

## [0.3.0] - 2026-08-13

### Added
- **Desktop app** — Tauri 2 shell packaging AIHome as a double-clickable macOS dmg: spawns the standalone Next.js server on `127.0.0.1:3010`, health-polling window, tray menu, launch-at-login, and a repeatable smoke script (`scripts/smoke-desktop.sh`).
- **Workbench** (`/workbench`): AI platform collection with API key management (multi-key per site, current-key switching) and live balance badges for DeepSeek / OpenAI / OpenRouter; settings section for auto-refresh.
- **API key encryption at rest** — AES-256-GCM with macOS Keychain master key (env override for tests); legacy plaintext keys auto-migrate on read; database permission tightened to 0600.
- **Console page (`/console`)** — FileVision runtime merge: file tree with live watching, agent run console (Claude Code / Codex start-stop, step progress, logs, diffs & rollback), pipeline orchestration, one-click task dispatch with auto provider/model scheduling and fallback chains, Hermes integration, dashboard, history timeline, runtime settings drawer. Exposed under `/api/fv/*` (SQLite at `~/.aihome/filevision.db`, event-bus cursor polling); one-time migration from legacy `file-visualizer/data.db`.
- **Workbench merge** — sites/keys/balance CRUD under `/api/workbench/*` with legacy `ai-workbench` DB one-time migration.

## [Unreleased]

- feat: AI API 管理器（vault + 工具配置中心）——key 保险库（主密码 + AES-256-GCM 加密存 `~/.aihome/vault.enc`）、Claude Code / Codex / opencode 三工具适配 + 冲突保护 + 自动备份、usage 归属覆盖。
- Add CI for lint, production build, and Playwright coverage.
- Validate workspace configuration before persistence.
- Enforce configured workspace boundaries for files, scans, Agent IDs, and creation paths.
- Document the local-only security model and focused roadmap.

## [0.2.0] - 2026-08-05

### Added
- Usage dashboard (`/usage`): multi-source spend aggregator with K-line chart, stat charts, and collapsible usage table (CC Switch, Claude Code, Codex, opencode, hermes).
- Incremental local indexer with checkpoint + dedupe (cache at `~/.aihome/usage-cache.db`).

## [0.1.0] - 2026-07-16

- Add local scanning for `AGENTS.md` and `SKILL.md` definitions.
- Add board, graph, list, detail, and settings views.
- Add sample agents and end-to-end API/UI coverage.
