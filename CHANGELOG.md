# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases use Semantic Versioning.

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
