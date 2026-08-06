# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases use Semantic Versioning.

## [Unreleased]

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
