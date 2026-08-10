# AIHome Skill Registry (P1) Implementation Plan — Part 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 本文件是 `2026-08-10-aihome-registry-plan.md` / `-part2.md` 的延续（Task 5-6）。设计文档 §4 P1。

**Goal:** 完成注册表 REST API（Task 5）与注册表 UI 页（Task 6）。

**Architecture:** API 沿用现有 `src/app/api/sync/*` 模式（每个端点一个 route.ts，`Registry` 每次请求 open/close）；UI 用客户端组件 + fetch（现有组件风格，SWR 可选）。

## Global Constraints（延续）

- API 失败返回 `{ error: string }` + 适当状态码；成功返回数据对象
- UI 元素加 `data-testid`（e2e 断言用）：`registry-sync` / `registry-sync-dryrun` / `registry-doctor` / `registry-doctor-fix` / `registry-import` / `registry-issues` / `badge-<platform>-<skillId>` / `delete-<skillId>`
- 删除级联：先移除所有启用平台的链接（`removeSkillFromPlatform`），再 `reg.deleteSkill(id)`
- 现有 115 单测 / 110 e2e 保持全绿；e2e `PORT=3100`

---

### Task 5: `/api/registry/*` REST 路由 + playwright env + e2e

**Files:**
- Create: `src/app/api/registry/skills/route.ts`（GET 列表 + 平台状态聚合）
- Create: `src/app/api/registry/skills/[id]/route.ts`（DELETE 级联）
- Create: `src/app/api/registry/import/route.ts`（POST）
- Create: `src/app/api/registry/sync/route.ts`（POST，`?dryRun=true`）
- Create: `src/app/api/registry/doctor/route.ts`（GET）
- Create: `src/app/api/registry/doctor/fix/route.ts`（POST）
- Modify: `playwright.config.ts`（webServer.env 加 `AIHOME_REGISTRY_DIR`）
- Create: `e2e/tests/registry.spec.ts`

**Interfaces:**
- Consumes: Task 1-4 全部 lib 模块
- Produces: REST 契约（Task 6 UI 消费）

- [ ] **Step 1: 写 skills 列表路由（聚合平台状态）**

```typescript
// src/app/api/registry/skills/route.ts
import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { ensurePlatformsRegistered } from '@/lib/registry/adapters';

export async function GET() {
  try {
    const reg = new Registry();
    reg.open();
    ensurePlatformsRegistered(reg);
    const skills = reg.listSkills();
    const platforms = reg.listPlatforms();
    const enriched = skills.map((s) => ({
      ...s,
      platforms: platforms.map((p) => ({
        name: p.name,
        enabled: p.enabled === 1,
        status: reg.getSyncState(s.id, p.name)?.status ?? 'none',
      })),
    }));
    reg.close();
    return NextResponse.json({ skills: enriched, platforms });
  } catch (error) {
    console.error('Registry skills error:', error);
    return NextResponse.json({ error: 'Failed to load registry' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 写 sync / import / doctor 路由**

```typescript
// src/app/api/registry/sync/route.ts
import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { syncSkills } from '@/lib/registry/sync-engine';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    const body = (await req.json().catch(() => ({}))) as { platform?: string; skillId?: string };
    const reg = new Registry();
    reg.open();
    const results = syncSkills(reg, { dryRun, platform: body.platform, skillId: body.skillId });
    reg.close();
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Registry sync error:', error);
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 });
  }
}
```

```typescript
// src/app/api/registry/import/route.ts
import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { importSkill } from '@/lib/registry/sync-engine';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name: string; sourcePath: string };
    if (!body?.name || !body?.sourcePath) {
      return NextResponse.json({ error: 'name and sourcePath required' }, { status: 400 });
    }
    const reg = new Registry();
    reg.open();
    const result = importSkill(reg, { name: body.name, sourcePath: body.sourcePath });
    reg.close();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Registry import error:', error);
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 });
  }
}
```

```typescript
// src/app/api/registry/doctor/route.ts
import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { runDoctor } from '@/lib/registry/doctor';

export async function GET() {
  try {
    const reg = new Registry();
    reg.open();
    const issues = runDoctor(reg);
    reg.close();
    return NextResponse.json({ issues });
  } catch (error) {
    console.error('Registry doctor error:', error);
    return NextResponse.json({ error: 'Failed to run doctor' }, { status: 500 });
  }
}
```

```typescript
// src/app/api/registry/doctor/fix/route.ts
import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { runDoctor } from '@/lib/registry/doctor';

export async function POST() {
  try {
    const reg = new Registry();
    reg.open();
    const issues = runDoctor(reg, { fix: true });
    reg.close();
    return NextResponse.json({ issues });
  } catch (error) {
    console.error('Registry doctor fix error:', error);
    return NextResponse.json({ error: 'Failed to fix' }, { status: 500 });
  }
}
```

- [ ] **Step 3: 写删除路由（级联）**

```typescript
// src/app/api/registry/skills/[id]/route.ts
import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { removeSkillFromPlatform } from '@/lib/registry/sync-engine';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reg = new Registry();
    reg.open();
    const platforms = reg.listPlatforms().filter((p) => p.enabled === 1);
    const results = platforms.map((p) => removeSkillFromPlatform(reg, id, p.name));
    reg.deleteSkill(id);
    reg.close();
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Registry delete error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
```

- [ ] **Step 4: playwright.config.ts 补 env + 写 e2e**

在 `webServer.env` 中加：
```typescript
AIHOME_REGISTRY_DIR: path.join(e2eSyncRoot, 'registry'),
```

```typescript
// e2e/tests/registry.spec.ts
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const REGISTRY_DIR = path.join(__dirname, '..', '.e2e-sync', 'registry');

test.describe('Registry API flow', () => {
  test.beforeAll(() => {
    fs.rmSync(REGISTRY_DIR, { recursive: true, force: true });
  });

  test('import → sync → list → delete cascade', async ({ request }) => {
    const sample = path.join(__dirname, '..', '..', 'data', 'sample-agents', 'code-assistant');
    const tmp = path.join(os.tmpdir(), 'aihome-e2e-import');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.cpSync(sample, tmp, { recursive: true });

    const importRes = await request.post('/api/registry/import', {
      data: { name: 'e2e-skill', sourcePath: tmp },
    });
    expect(importRes.status()).toBe(200);
    const imported = await importRes.json();
    expect(imported.id).toBe('e2e-skill');

    const syncRes = await request.post('/api/registry/sync');
    expect(syncRes.status()).toBe(200);
    const sync = await syncRes.json();
    expect(Array.isArray(sync.results)).toBe(true);

    const listRes = await request.get('/api/registry/skills');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.skills.some((s: { id: string }) => s.id === 'e2e-skill')).toBe(true);
    expect(Array.isArray(list.platforms)).toBe(true);

    const delRes = await request.delete('/api/registry/skills/e2e-skill');
    expect(delRes.status()).toBe(200);
    const list2 = await (await request.get('/api/registry/skills')).json();
    expect(list2.skills.some((s: { id: string }) => s.id === 'e2e-skill')).toBe(false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 5: 跑测试**

Run: `npm test` + `PORT=3100 npx playwright test e2e/tests/registry.spec.ts`
Expected: 单测全绿；registry e2e 通过

- [ ] **Step 6: 全量回归**

Run: `PORT=3100 npx playwright test`
Expected: 110 + 1 = 111 全绿

- [ ] **Step 7: Commit**

```bash
git add src/app/api/registry/ playwright.config.ts e2e/tests/registry.spec.ts
git commit -m "feat(registry): registry REST API + e2e flow"
```

---

### Task 6: 注册表 UI 页（/skills）

**Files:**
- Create: `src/app/skills/page.tsx`
- Create: `src/components/registry/RegistryPanel.tsx`
- Create: `src/components/registry/SkillRow.tsx`
- Modify: `src/components/layout/TopNav.tsx`（加「注册表」链接）

**Interfaces:**
- Consumes: `/api/registry/*`（Task 5）
- Produces: 导航可见的注册表页（列表/导入/同步/dry-run/doctor/修复/删除）

- [ ] **Step 1: 读 TopNav 现有导航模式**

Read: `src/components/layout/TopNav.tsx`
沿用现有 `<Link href="/xxx">` + lucide 图标的样式（看 Usage/Sync 怎么写的，照抄其结构）。

- [ ] **Step 2: 写 SkillRow 组件**

```tsx
// src/components/registry/SkillRow.tsx
'use client';

type Skill = {
  id: string;
  name: string;
  description: string;
  platforms: { name: string; enabled: boolean; status: string }[];
};

export function SkillRow({ skill }: { skill: Skill }) {
  async function handleDelete() {
    if (!window.confirm(`删除 ${skill.name}？将移除其在所有启用平台上的链接（不删除平台目录内容）。`)) return;
    await fetch(`/api/registry/skills/${skill.id}`, { method: 'DELETE' });
    window.location.reload();
  }

  return (
    <li className="flex items-center justify-between rounded border p-3">
      <div>
        <div className="font-medium">{skill.name}</div>
        <div className="text-sm text-gray-500">{skill.description}</div>
        <div className="mt-1 flex gap-2">
          {skill.platforms.map((p) => (
            <span
              key={p.name}
              data-testid={`badge-${p.name}-${skill.id}`}
              className={
                p.status === 'linked'
                  ? 'rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700'
                  : p.status === 'conflict'
                    ? 'rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700'
                    : 'rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500'
              }
            >
              {p.name}: {p.status === 'none' ? '未同步' : p.status}
            </span>
          ))}
        </div>
      </div>
      <button onClick={handleDelete} className="text-sm text-red-500" data-testid={`delete-${skill.id}`}>
        删除
      </button>
    </li>
  );
}
```

- [ ] **Step 3: 写 RegistryPanel 组件**

```tsx
// src/components/registry/RegistryPanel.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { SkillRow } from './SkillRow';

type Skill = {
  id: string;
  name: string;
  description: string;
  platforms: { name: string; enabled: boolean; status: string }[];
};
type DoctorIssue = { skill: string; platform: string; type: string; detail: string; fixed?: boolean };

export function RegistryPanel() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [issues, setIssues] = useState<DoctorIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/registry/skills');
    const data = await res.json();
    setSkills(data.skills ?? []);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [refresh]);

  async function runSync(dryRun = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/registry/sync${dryRun ? '?dryRun=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      await res.json();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runDoctor(fix = false) {
    setBusy(true);
    try {
      const res = await fetch(fix ? '/api/registry/doctor/fix' : '/api/registry/doctor', {
        method: fix ? 'POST' : 'GET',
      });
      const data = await res.json();
      setIssues(data.issues ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    const name = window.prompt('技能名称（生成注册表 id）');
    if (!name) return;
    const sourcePath = window.prompt('源目录绝对路径（含 SKILL.md 的目录）');
    if (!sourcePath) return;
    try {
      await fetch('/api/registry/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sourcePath }),
      });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-red-500">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => runSync()} disabled={busy} data-testid="registry-sync" className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          同步全部
        </button>
        <button onClick={() => runSync(true)} disabled={busy} data-testid="registry-sync-dryrun" className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          试运行
        </button>
        <button onClick={() => runDoctor(false)} disabled={busy} data-testid="registry-doctor" className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          健康检查
        </button>
        <button onClick={() => runDoctor(true)} disabled={busy} data-testid="registry-doctor-fix" className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          修复
        </button>
        <button onClick={handleImport} disabled={busy} data-testid="registry-import" className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          导入
        </button>
      </div>

      {issues.length > 0 && (
        <ul data-testid="registry-issues" className="space-y-1 text-sm text-amber-600">
          {issues.map((i, idx) => (
            <li key={idx}>
              [{i.type}] {i.skill}/{i.platform} — {i.detail}
              {i.fixed ? ' ✓ 已修复' : ''}
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-2">
        {skills.map((s) => (
          <SkillRow key={s.id} skill={s} />
        ))}
        {skills.length === 0 && <li className="text-sm text-gray-400">注册表为空——点「导入」从平台目录导入技能</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 写页面 + TopNav 链接**

```tsx
// src/app/skills/page.tsx
import { RegistryPanel } from '@/components/registry/RegistryPanel';

export default function SkillsPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-semibold">技能注册表</h1>
      <p className="mb-4 text-sm text-gray-500">
        规范副本只存一份，通过符号链接分发到各 agent 平台（Claude Code / Codex / WorkBuddy）。真实目录不会被覆盖。
      </p>
      <RegistryPanel />
    </main>
  );
}
```

TopNav：仿现有 Usage/Sync 导航项加：
```tsx
<Link href="/skills" className="...">
  <span>注册表</span>
</Link>
```
（按 TopNav 现有结构、图标、类名照抄模式）

- [ ] **Step 5: 手动验证**

Run: `npm run dev -- -p 3100` → 打开 `http://127.0.0.1:3100/skills`
Expected: 导航有「注册表」；页面渲染；导入（用 `data/sample-agents/code-assistant` 目录路径试一次）→ 同步 → 徽标变化

- [ ] **Step 6: 全量验证**

Run: `npm run lint`、`npx tsc --noEmit`、`npm test`、`PORT=3100 npx playwright test`
Expected: 全绿（lint 0 error、tsc 干净、单测全绿、111 e2e 全绿）

- [ ] **Step 7: Commit**

```bash
git add src/app/skills/ src/components/registry/ src/components/layout/TopNav.tsx
git commit -m "feat(registry): registry page UI with sync/doctor/import/delete"
```

---

## P1 完成标准

- `npm test` 全绿（115 + 27 新增 ≈ 142）
- `PORT=3100 npx playwright test` 111 全绿
- `npm run lint` / `npx tsc --noEmit` 干净
- 手动：`/skills` 页导入 → 同步 → 徽标 → 删除全流程可用
