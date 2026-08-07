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

## In-flight work (as of 2026-08-06)
- `feat/usage-aggregator` branch: usage aggregator implementation (design: `docs/superpowers/specs/2026-08-05-usage-aggregator-design.md`, plan: `docs/superpowers/plans/2026-08-05-usage-aggregator.md`). Tasks 1–9 done, Task 10 `src/lib/usage/aggregate.ts` + tests WIP — has 1 failing test (`__tests__/aggregate.test.ts:49`, test bug per rule 5).
- `feat/runner-panel` worktree `.worktrees/runner-panel/`: has UNCOMMITTED changes (`src/lib/runner/process-registry.ts` + test) — do not touch, do not commit, do not prune. It is separate in-flight work owned by the user.
