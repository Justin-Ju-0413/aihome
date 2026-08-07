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

## In-flight work (as of 2026-08-07)
- ✅ DONE: usage aggregator (feat/usage-aggregator) — merged to main via PR #5 (076084b), all 87 plan tasks ticked. Graph dependency-edge bug fixed separately via PR #7 (7ffacb8). Local e2e now supports `PORT` env to avoid clashing with other projects on port 3000.
- `feat/runner-panel` worktree `.worktrees/runner-panel/`: ACTIVE in-flight work owned by the user — 34 commits ahead of main (orchestrator, MCP server, /runs panel, scheduler tick). Worktree is currently clean; do not touch, do not commit, do not prune. NOTE: plan `docs/superpowers/plans/2026-08-05-runner-panel.md` has 0/81 boxes ticked despite heavy implementation — plan checkboxes lag behind (user's stream).
- Workspace root has stray untracked `" 2"`-suffixed duplicate files (`src/app/usage/page 2.tsx`, etc.) — user-owned copies, never `git add` them.
