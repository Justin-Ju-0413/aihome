<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent Workflow Rules

## Commands
- Unit tests: `npm test` (vitest run) — run before finishing ANY task
- E2E: `npm run test:e2e`
- Lint: `npm run lint` · Build: `npm run build` · Type check via `npx tsc --noEmit`

## Hard rules (learned from real failures)
1. **Never leave a failing test in the working tree.** A failing test = task not done. Fix it (test bug OR code bug — decide which, don't guess) or revert it before moving on.
2. **Update plan checkboxes as you go.** When you complete a step in `docs/superpowers/plans/*.md`, tick its `- [ ]` box in the same commit. An unchecked plan means the plan has drifted.
3. **Never create git worktrees inside the repo.** `.worktrees/` is already committed-adjacent untracked dirt; it is gitignored — do not add more worktrees there, and never `git add` anything under `.worktrees/`.
4. **Commit only intended files.** No stray downloads (`.github/*.svg`, etc.). Check `git status` before every commit.
5. **Timezones:** aggregation code uses LOCAL time boundaries (today/week/month). Tests must construct timestamps with local `new Date(...)`, NOT `Date.UTC(...)` — a UTC-constructed "now" against local boundaries is a test bug, not an implementation bug.

## In-flight work (as of 2026-08-13)
- ✅ DONE: usage aggregator (feat/usage-aggregator) — merged to main via PR #5 (076084b), all 87 plan tasks ticked. Graph dependency-edge bug fixed separately via PR #7 (7ffacb8). Local e2e now supports `PORT` env to avoid clashing with other projects on port 3000.
- ✅ DONE: desktop shell P0 — `feat/desktop-app` (Tauri 2 shell + standalone lifecycle + dmg + smoke), plan `2026-08-10-aihome-desktop-shell-plan.md` fully ticked. Rust toolchain is brew rustup (`/opt/homebrew/opt/rustup/bin`); harness shell needs explicit PATH.
- ✅ DONE: workbench merge (`/workbench` + `/api/workbench/*`, AES-256-GCM key encryption with Keychain master key) and FileVision console merge (`/console` + `/api/fv/*`), both on `feat/desktop-app`. Plan `2026-08-12-aihome-workbench-merge.md` ticked; desktop shell/registry/widget plans updated per 2026-08-13 perfection plan.
- `feat/runner-panel` worktree `.worktrees/runner-panel/`: legacy in-flight work owned by the user — its functionality landed in merged form as the fv console (`/console`, `src/lib/fv/`). Worktree still exists; do not touch, do not commit, do not prune. Plan `docs/superpowers/plans/2026-08-05-runner-panel.md` remains 0/81 ticked (superseded by console merge).
- Known desktop limitation (tracked in desktop-shell plan): SIGTERM (kill) still leaks the next-server child on non-graceful exits — signal hardening is item 1.1 of `2026-08-13-aihome-perfection-plan.md`.
