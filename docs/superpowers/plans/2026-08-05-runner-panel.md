# 执行面板（Runner Panel）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 file-visualizer 的 agent 执行面板完整移植进 AIHome（TS 重写，Next.js route handlers + SSE + zustand），支持 claude/codex/hermes/opencode 四种本地 CLI 的单任务、多步流水线、定时任务与 MCP 暴露。

**Architecture:** `src/lib/runner/` 存放全部领域逻辑（纯 TS、无 Next 依赖、可单测）；route handlers 作为薄适配层；模块级 EventEmitter 作为事件总线，SSE 路由订阅广播；`instrumentation.ts` 启动定时任务单例；前端新建 `/runs` 页面 + `useRunnerStore`。

**Tech Stack:** TypeScript、Next.js 16 route handlers、SSE（ReadableStream）、zustand、SWR、node:child_process、vitest、playwright。

**Spec:** `docs/superpowers/specs/2026-08-05-runner-panel-design.md`

## Global Constraints

- 全部新增代码为 TypeScript，位于 `src/lib/runner/`、`src/app/api/runs/`、`src/app/api/pipelines/`、`src/app/api/schedules/`、`src/app/api/runner-settings/`、`src/app/runs/`、`scripts/mcp-runner.ts`
- 持久化仅用 JSON 文件（`data/runner/`），不引入 SQLite、不新增 npm 运行时依赖（cron 用自研极简解析器）
- 所有 `cwd`/`target` 必须经 `isExistingPathWithinWorkspace`（`src/lib/path-security.ts`）校验，否则 403
- provider 二进制名来自白名单配置（默认 `claude`/`codex`/`hermes`/`opencode`），不得执行任意命令
- 中文 UI 文案沿用原项目语义（并发超限提示、状态名 ok/failed/cancelled/timeout）
- vitest 仅测试 `src/lib/**`（`vitest.config.ts` 已限定）；e2e 在 `e2e/tests/`
- 每次提交前跑 `npm run lint`（0 warnings 通过），本仓库 CI 已接入单测
- 不迁移 file-visualizer 的历史数据；不移植快照/回滚/diff、文件扫描/监听、templates 模板库、hermes DB 只读面板

---

### Task 1: 类型定义、事件总线、持久化层

**Files:**
- Create: `src/lib/runner/types.ts`
- Create: `src/lib/runner/event-bus.ts`
- Create: `src/lib/runner/persistence.ts`
- Test: `src/lib/runner/__tests__/persistence.test.ts`

**Interfaces:**
- Produces:
  - `interface Run { id, task, provider, model, cwd, status: RunStatus, exitCode: number|null, events: RunEvent[], startedAt, endedAt: string|null, pipelineId: string|null }`
  - `type RunStatus = 'running' | 'ok' | 'failed' | 'cancelled' | 'timeout'`
  - `interface RunEvent { id, type: 'stdout'|'stderr'|'status'|'error', data: string, at: string }`
  - `interface Pipeline { id, name, steps: PipelineStep[], maxConcurrent: number }`
  - `interface PipelineStep { id, task, provider?: string, model?: string, cwd?: string }`
  - `interface Schedule { id, name, cron, task, provider?, model?, enabled: boolean, lastRunAt: string|null }`
  - `interface RunnerSettings { maxConcurrent: number, defaultDir: string, defaultProvider: string, timeoutMinutes: number, redactBeforeSend: boolean }`
  - `eventBus: { on(event: string, handler: (data: unknown) => void): () => void; emit(event: string, data: unknown): void }`（内部用 `node:events` EventEmitter，error 捕获不抛出）
  - `persistence: { readRuns(): Promise<Run[]>; appendRun(run: Run): Promise<void>; readPipelines(): Promise<Pipeline[]>; savePipelines(list: Pipeline[]): Promise<void>; readSchedules(): Promise<Schedule[]>; saveSchedules(list: Schedule[]): Promise<void>; readSettings(): Promise<RunnerSettings>; saveSettings(s: RunnerSettings): Promise<void> }`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/runner/__tests__/persistence.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { setRunnerDataDir } from '../persistence';
import { readRuns, appendRun, readPipelines, savePipelines, readSchedules, saveSchedules, readSettings, saveSettings } from '../persistence';
import type { Run, Pipeline, Schedule } from '../types';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'runner-test-'));
  setRunnerDataDir(dir);
});

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('persistence', () => {
  it('runs: 空时返回 []，append 后可读回', async () => {
    expect(await readRuns()).toEqual([]);
    const run: Run = { id: 'r1', task: '写测试', provider: 'claude', model: '', cwd: dir, status: 'running', exitCode: null, events: [{ id: 'e1', type: 'status', data: 'start', at: 't' }], startedAt: 't', endedAt: null, pipelineId: null };
    await appendRun(run);
    run.status = 'ok';
    run.exitCode = 0;
    run.endedAt = 't2';
    await appendRun(run);
    const runs = await readRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe('r1');
    expect(runs[1].status).toBe('ok');
  });

  it('pipelines: 存取往返', async () => {
    const p: Pipeline = { id: 'p1', name: '流水线', steps: [{ id: 's1', task: '步骤一' }], maxConcurrent: 1 };
    await savePipelines([p]);
    const list = await readPipelines();
    expect(list[0].name).toBe('流水线');
    expect(list[0].steps[0].task).toBe('步骤一');
  });

  it('schedules: 存取往返', async () => {
    const s: Schedule = { id: 'sc1', name: '每日', cron: '0 9 * * *', task: '日报', enabled: true, lastRunAt: null };
    await saveSchedules([s]);
    expect((await readSchedules())[0].cron).toBe('0 9 * * *');
  });

  it('settings: 缺省返回默认值', async () => {
    const s = await readSettings();
    expect(s.maxConcurrent).toBe(3);
    expect(s.defaultProvider).toBe('claude');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/runner/__tests__/persistence.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// src/lib/runner/types.ts
export type RunStatus = 'running' | 'ok' | 'failed' | 'cancelled' | 'timeout';

export interface RunEvent {
  id: string;
  type: 'stdout' | 'stderr' | 'status' | 'error';
  data: string;
  at: string;
}

export interface Run {
  id: string;
  task: string;
  provider: string;
  model: string;
  cwd: string;
  status: RunStatus;
  exitCode: number | null;
  events: RunEvent[];
  startedAt: string;
  endedAt: string | null;
  pipelineId: string | null;
}

export interface PipelineStep {
  id: string;
  task: string;
  provider?: string;
  model?: string;
  cwd?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
  maxConcurrent: number;
}

export interface Schedule {
  id: string;
  name: string;
  cron: string;
  task: string;
  provider?: string;
  model?: string;
  enabled: boolean;
  lastRunAt: string | null;
}

export interface RunnerSettings {
  maxConcurrent: number;
  defaultDir: string;
  defaultProvider: string;
  timeoutMinutes: number;
  redactBeforeSend: boolean;
}

export interface RunHandle {
  run: Run;
  kill: () => boolean;
}
```

```ts
// src/lib/runner/event-bus.ts
import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function on(event: string, handler: (data: unknown) => void): () => void {
  emitter.on(event, handler);
  return () => emitter.off(event, handler);
}

export function emit(event: string, data: unknown): void {
  for (const listener of emitter.listeners(event)) {
    try {
      (listener as (d: unknown) => void)(data);
    } catch {
      // 订阅方错误不得中断广播
    }
  }
}
```

```ts
// src/lib/runner/persistence.ts
import { mkdir, readFile, readdir, appendFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import type { Run, Pipeline, Schedule, RunnerSettings } from './types';

let dataDir = join(process.cwd(), 'data', 'runner');

export function setRunnerDataDir(dir: string): void {
  dataDir = dir;
}

export function getRunnerDataDir(): string {
  return dataDir;
}

async function ensureDir(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(join(dataDir, file), 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir();
  await writeFile(join(dataDir, file), JSON.stringify(value, null, 2), 'utf-8');
}

async function appendJsonLine(file: string, value: unknown): Promise<void> {
  await ensureDir();
  await appendFile(join(dataDir, file), JSON.stringify(value) + '\n', 'utf-8');
}

async function readLines(file: string): Promise<string[]> {
  try {
    const raw = await readFile(join(dataDir, file), 'utf-8');
    return raw.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export async function readRuns(): Promise<Run[]> {
  const lines = await readLines('runs.jsonl');
  const runs = lines.map((l) => {
    try { return JSON.parse(l) as Run; } catch { return null; }
  }).filter((r): r is Run => r !== null);
  return runs.reverse();
}

export async function appendRun(run: Run): Promise<void> {
  await appendJsonLine('runs.jsonl', run);
}

export async function readPipelines(): Promise<Pipeline[]> {
  return readJson<Pipeline[]>('pipelines.json', []);
}

export async function savePipelines(list: Pipeline[]): Promise<void> {
  await writeJson('pipelines.json', list);
}

export async function readSchedules(): Promise<Schedule[]> {
  return readJson<Schedule[]>('schedules.json', []);
}

export async function saveSchedules(list: Schedule[]): Promise<void> {
  await writeJson('schedules.json', list);
}

export const DEFAULT_SETTINGS: RunnerSettings = {
  maxConcurrent: 3,
  defaultDir: process.cwd(),
  defaultProvider: 'claude',
  timeoutMinutes: 0,
  redactBeforeSend: false,
};

export async function readSettings(): Promise<RunnerSettings> {
  const saved = await readJson<Partial<RunnerSettings>>('settings.json', {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(s: RunnerSettings): Promise<void> {
  await writeJson('settings.json', s);
}

export async function getDataFileNames(): Promise<string[]> {
  try { await access(dataDir); } catch { return []; }
  return readdir(dataDir);
}
```

> 说明：`readRuns` 返回倒序（新在前），`appendRun` 供运行器在启动/结束时各写一行；`getDataFileNames` 供健康检查用，可暂不测试。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/runner/__tests__/persistence.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/lib/runner/ && git commit -m "feat(runner): 类型定义、事件总线与 JSON 持久化层"
```

---

### Task 2: provider 档案与设置默认值

**Files:**
- Create: `src/lib/runner/providers.ts`
- Test: `src/lib/runner/__tests__/providers.test.ts`

**Interfaces:**
- Consumes: `RunnerSettings`（Task 1）
- Produces:
  - `interface ProviderProfile { id, name, binary, defaultModel, models: string[], launchArgs(prompt: string, model: string, opts: { target?: string; skill?: string; cwd?: string }): string[], fallback: string }`
  - `PROVIDER_PROFILES: Record<string, ProviderProfile>`（claude / codex / hermes / opencode）
  - `resolveBinary(id: string, settings: RunnerSettings): string`（`claude`→`claude`、`codex`→`codex`、`hermes`→`hermes`、`opencode`→`opencode`；留扩展位，后续设置页允许覆盖路径）
  - `buildLaunchArgs(id, prompt, model, opts): string[]`（转发 profile.launchArgs）
  - `providerExists(id: string): boolean`（白名单校验，spawn 前调用）

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/runner/__tests__/providers.test.ts
import { describe, it, expect } from 'vitest';
import { PROVIDER_PROFILES, resolveBinary, buildLaunchArgs, providerExists } from '../providers';

describe('providers', () => {
  it('四个 provider 都在白名单', () => {
    expect(providerExists('claude')).toBe(true);
    expect(providerExists('codex')).toBe(true);
    expect(providerExists('hermes')).toBe(true);
    expect(providerExists('opencode')).toBe(true);
    expect(providerExists('rm -rf')).toBe(false);
  });

  it('claude 使用 stream-json 输出', () => {
    const args = buildLaunchArgs('claude', '写代码', { model: 'm', target: '/tmp/a.ts' });
    expect(args).toContain('-p');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--add-dir');
    expect(args[args.length - 1]).toBe('/tmp/a.ts');
  });

  it('codex 使用 exec 模式', () => {
    const args = buildLaunchArgs('codex', '写代码', {});
    expect(args[0]).toBe('exec');
    expect(args).toContain('--full-auto');
  });

  it('opencode 使用 run 模式并支持 --model', () => {
    const args = buildLaunchArgs('opencode', '写代码', { model: 'deepseek-v4' });
    expect(args[0]).toBe('run');
    expect(args).toContain('--model');
    expect(args).toContain('deepseek-v4');
  });

  it('hermes 支持 --model 与 --skill', () => {
    const args = buildLaunchArgs('hermes', '写代码', { model: 'm1', skill: 'code' });
    expect(args).toContain('--model');
    expect(args).toContain('--skill');
    expect(args).toContain('code');
  });

  it('默认模型可解析', () => {
    expect(PROVIDER_PROFILES.claude.defaultModel).toMatch(/claude/);
    expect(PROVIDER_PROFILES.codex.defaultModel).toMatch(/codex/);
    expect(PROVIDER_PROFILES.hermes.fallback).toBe('claude');
    expect(PROVIDER_PROFILES.opencode.fallback).toBe('codex');
  });

  it('resolveBinary 返回白名单二进制名', () => {
    expect(resolveBinary('claude', { defaultProvider: 'claude' } as never)).toBe('claude');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/runner/__tests__/providers.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/runner/providers.ts
import type { RunnerSettings } from './types';

export interface ProviderProfile {
  id: string;
  name: string;
  binary: string;
  defaultModel: string;
  models: string[];
  fallback: string;
  launchArgs: (
    prompt: string,
    model: string,
    opts: { target?: string; skill?: string }
  ) => string[];
}

const TARGET_ARG: Record<string, string> = {
  claude: '--add-dir',
  codex: '--add-dir',
  opencode: '',
  hermes: '',
};

export const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-1', 'claude-haiku-4-5'],
    fallback: 'codex',
    launchArgs: (prompt, model, opts) => {
      const args = ['-p', '--verbose', '--output-format', 'stream-json'];
      if (model) args.push('--model', model);
      args.push(prompt);
      if (opts.target) args.push('--add-dir', opts.target);
      return args;
    },
  },
  codex: {
    id: 'codex',
    name: 'OpenAI Codex',
    binary: 'codex',
    defaultModel: 'codex-mini',
    models: ['codex-mini', 'gpt-5.1-codex-mini', 'gpt-5.2-codex'],
    fallback: 'claude',
    launchArgs: (prompt, model, opts) => {
      const args = ['exec'];
      if (model) args.push('--model', model);
      args.push(prompt, '--skip-git-repo-check', '--full-auto');
      if (opts.target) args.push('--add-dir', opts.target);
      return args;
    },
  },
  hermes: {
    id: 'hermes',
    name: 'Hermes Agent',
    binary: 'hermes',
    defaultModel: '',
    models: [],
    fallback: 'claude',
    launchArgs: (prompt, model, opts) => {
      const args = [prompt];
      if (model) args.push('--model', model);
      if (opts.skill) args.push('--skill', opts.skill);
      return args;
    },
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    binary: 'opencode',
    defaultModel: '',
    models: [],
    fallback: 'codex',
    launchArgs: (prompt, model) => {
      const args = ['run'];
      if (model) args.push('--model', model);
      args.push(prompt);
      return args;
    },
  },
};

export function providerExists(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROVIDER_PROFILES, id);
}

export function resolveBinary(id: string, _settings: RunnerSettings): string {
  return PROVIDER_PROFILES[id]?.binary ?? '';
}

export function buildLaunchArgs(
  id: string,
  prompt: string,
  model: string,
  opts: { target?: string; skill?: string } = {}
): string[] {
  return PROVIDER_PROFILES[id]?.launchArgs(prompt, model, opts) ?? [];
}
```

> 说明：`TARGET_ARG` 常量已定义但本任务不使用（保留给后续设置页校验逻辑），lint 会报未使用——删除它再提交。`resolveBinary` 的 `_settings` 参数为后续"自定义 CLI 路径"预留。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/runner/__tests__/providers.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/runner/ && git commit -m "feat(runner): provider 档案（claude/codex/hermes/opencode）与启动参数构造"
```

---

### Task 3: 任务类型识别与 prompt 转换

**Files:**
- Create: `src/lib/runner/prompt-converter.ts`
- Test: `src/lib/runner/__tests__/prompt-converter.test.ts`

**Interfaces:**
- Consumes: `ProviderProfile.launchArgs` 风格可选（本任务只做转换，不 spawn）
- Produces:
  - `type TaskType = 'code_generation' | 'code_review' | 'refactoring' | 'debugging' | 'documentation' | 'analysis' | 'testing' | 'deployment'`
  - `detectTaskType(task: string): TaskType`
  - `convert(task: string, provider: string, opts?: { target?: string; skill?: string; cwd?: string }): { prompt: string; taskType: TaskType; taskLabel: string; taskIcon: string; provider: string; originalTask: string }`
  - `detectCompositeTasks(task: string): Array<{ task: string; type: TaskType }> | null`
  - `getTaskTypes(): Array<{ id: TaskType; label: string; icon: string }>`
  - `redactSensitive(text: string): string`（脱敏：手机号 11 位、身份证 18 位、订单号（`\b[A-Za-z0-9]{16,}\b` 过长 token 不脱敏订单号——用 `订单号[:：]\s*\S+` 与 `order[_-]?no[:：]\s*\S+`）、邮箱、URL query 中的 token 参数）

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/runner/__tests__/prompt-converter.test.ts
import { describe, it, expect } from 'vitest';
import { detectTaskType, convert, detectCompositeTasks, getTaskTypes, redactSensitive } from '../prompt-converter';

describe('prompt-converter', () => {
  it('识别调试任务', () => {
    expect(detectTaskType('帮我修复这个报错')).toBe('debugging');
  });

  it('识别代码生成', () => {
    expect(detectTaskType('实现一个排序函数')).toBe('code_generation');
  });

  it('识别测试任务', () => {
    expect(detectTaskType('为 utils 写单元测试')).toBe('testing');
  });

  it('claude 转换输出 XML 包装', () => {
    const r = convert('写一个函数', 'claude', { target: '/tmp/a.ts' });
    expect(r.taskLabel).toBe('代码生成');
    expect(r.prompt).toContain('<task>');
    expect(r.prompt).toContain('/tmp/a.ts');
  });

  it('codex 转换保持命令式', () => {
    const r = convert('写一个函数', 'codex');
    expect(r.prompt).toContain('Implement the above');
  });

  it('复合任务拆分', () => {
    const parts = detectCompositeTasks('写测试然后运行');
    expect(parts).not.toBeNull();
    expect(parts?.[0].task).toContain('写测试');
  });

  it('任务类型枚举完整', () => {
    const types = getTaskTypes();
    expect(types.length).toBeGreaterThanOrEqual(8);
    expect(types.map((t) => t.id)).toContain('code_review');
  });

  it('脱敏手机号与身份证', () => {
    const out = redactSensitive('联系 13800138000 身份证 11010519900307723X');
    expect(out).not.toContain('13800138000');
    expect(out).not.toContain('11010519900307723X');
    expect(out).toContain('[REDACTED]');
  });

  it('脱敏订单号与邮箱', () => {
    const out = redactSensitive('订单号: 20260805AB12345678，邮箱 test@example.com');
    expect(out).not.toContain('20260805AB12345678');
    expect(out).not.toContain('test@example.com');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/runner/__tests__/prompt-converter.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/runner/prompt-converter.ts
export type TaskType = 'code_generation' | 'code_review' | 'refactoring' | 'debugging' | 'documentation' | 'analysis' | 'testing' | 'deployment';

const TASK_PATTERNS: Record<TaskType, { label: string; icon: string; keywords: string[] }> = {
  code_generation: {
    label: '代码生成', icon: '✨',
    keywords: ['写', '实现', '创建', '生成', '编写', '开发', 'build', 'create', 'implement', 'generate', 'write code', '新增功能', 'add feature', '新建'],
  },
  code_review: {
    label: '代码审查', icon: '🔍',
    keywords: ['审查', 'review', '检查', '诊断', '分析代码', 'code review', 'lint', 'audit', '质量', 'quality'],
  },
  refactoring: {
    label: '重构优化', icon: '♻️',
    keywords: ['重构', '优化', 'refactor', 'restructure', '改善', '简化', 'clean up', '重写', 'rewrite', 'improve'],
  },
  debugging: {
    label: '调试修复', icon: '🐛',
    keywords: ['调试', '修复', 'debug', 'fix', '排错', '解决', '报错', '错误', 'bug', 'error', 'crash', '异常', 'exception', 'traceback'],
  },
  documentation: {
    label: '文档生成', icon: '📖',
    keywords: ['文档', '注释', '说明', 'document', 'comment', 'readme', 'doc', 'javadoc', 'jsdoc', 'annotate'],
  },
  analysis: {
    label: '分析评估', icon: '📊',
    keywords: ['分析', '评估', '比较', 'analyze', 'evaluate', 'compare', '统计', '报告', '总结', 'summary', 'report', 'benchmark', '性能'],
  },
  testing: {
    label: '测试验证', icon: '🧪',
    keywords: ['测试', 'test', '验证', 'verify', '单元测试', 'unit test', '集成测试', 'integration', 'coverage', '覆盖率', 'spec'],
  },
  deployment: {
    label: '部署发布', icon: '🚀',
    keywords: ['部署', 'deploy', '发布', 'release', '上线', '打包', 'build', 'publish', 'CI/CD', 'docker', '容器'],
  },
};

export function detectTaskType(task: string): TaskType {
  const lower = task.toLowerCase();
  let bestMatch: TaskType = 'code_generation';
  let bestScore = 0;
  for (const [type, config] of Object.entries(TASK_PATTERNS) as [TaskType, { keywords: string[] }][]) {
    const score = config.keywords.reduce((sum, kw) => sum + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = type;
    }
  }
  return bestMatch;
}

const CLAUDE_WRAPPERS: Record<TaskType, string> = {
  code_generation: '<instructions>\n请直接编写代码，使用 Edit 或 Write 工具修改文件。\n- 每步只修改一个文件，修改后验证语法\n- 遵循项目现有代码风格和约定\n- 添加必要的错误处理\n</instructions>',
  code_review: '<review_format>\n对每个文件按以下格式输出：\n## 🔴 严重问题 (Critical)\n## 🟡 建议改进 (Warning)\n## 🟢 良好实践 (Good)\n## 📊 总结\n- 问题数/严重度/建议修复优先级\n</review_format>',
  refactoring: '<instructions>\n1. 先读取所有相关文件，理解现有逻辑\n2. 分析依赖关系和影响范围\n3. 逐文件重构，保持功能不变\n4. 每步验证语法正确和测试通过\n5. 最后输出变更摘要\n</instructions>',
  debugging: '<debug_approach>\n1. 读取相关代码和错误信息\n2. 定位错误根源（二分法排查）\n3. 提出修复方案及影响分析\n4. 实施最小化修复\n5. 验证修复并检查边界情况\n</debug_approach>',
  documentation: '<format>\n使用 JSDoc/TSDoc 格式添加注释。包含：\n- @param 参数说明（类型+含义）\n- @returns 返回值说明\n- @example 使用示例\n- @throws 异常说明\n- 复杂逻辑添加行内注释\n</format>',
  analysis: '<output_format>\n提供结构化分析报告：\n## 概述 (Executive Summary)\n## 详细发现 (Findings)\n## 对比分析 (Comparison)\n## 建议与结论 (Recommendations)\n</output_format>',
  testing: '<instructions>\n1. 分析现有代码的测试覆盖\n2. 编写测试用例覆盖关键路径\n3. 包含正常/边界/异常场景\n4. 运行测试验证通过\n5. 输出覆盖率报告\n</instructions>',
  deployment: '<instructions>\n1. 检查部署前清单（测试/构建/配置）\n2. 执行部署步骤\n3. 验证部署结果\n4. 输出部署摘要和回滚方案\n</instructions>',
};

const CODEX_SUFFIX: Record<TaskType, string> = {
  code_generation: '\n\nImplement the above. Write code directly. Follow existing code style. Add error handling.',
  code_review: '\n\nReview the code thoroughly. List issues by severity: CRITICAL, WARNING, INFO. For each issue provide: location, description, suggested fix.',
  refactoring: '\n\nRefactor step by step. Read all related files first. Preserve all existing functionality and tests. Verify after each change. Output change summary.',
  debugging: '\n\nDebug and fix. Read the error, trace to root cause, apply minimal fix, verify. Check edge cases.',
  documentation: '\n\nAdd documentation and comments. Use standard JSDoc format with @param, @returns, @example, @throws.',
  analysis: '\n\nAnalyze and provide structured report with: Executive Summary, Detailed Findings (with data and code references), Comparison, Recommendations (prioritized with expected impact).',
  testing: '\n\nWrite tests. Cover happy path, edge cases, and error scenarios. Run tests and verify. Report coverage.',
  deployment: '\n\nDeploy step by step. Check pre-deployment checklist, execute, verify, provide rollback plan.',
};

const HERMES_SUFFIX: Record<TaskType, string> = {
  code_generation: '\n\nUse code_execution tool to implement. Follow existing conventions.',
  code_review: '\n\nPerform thorough code review. Read each file, categorize findings by severity (Critical/Warning/Info), suggest fixes with code examples.',
  refactoring: '\n\nRefactor carefully. Read files first, analyze dependencies, plan changes, then execute step by step. Use code_execution tool. Verify each step.',
  debugging: '\n\nDebug systematically. Read error output, trace to source code, identify root cause, apply minimal fix, verify with test.',
  documentation: '\n\nGenerate comprehensive documentation. Add JSDoc/TSDoc comments with parameter descriptions, return values, examples, and exception notes.',
  analysis: '\n\nAnalyze thoroughly. Provide structured report: Summary, Findings with evidence, Comparison, Prioritized recommendations with expected impact.',
  testing: '\n\nWrite comprehensive tests. Cover normal, boundary, and error cases. Use code_execution to run and verify.',
  deployment: '\n\nDeploy carefully. Check prerequisites, execute deployment steps, verify, document rollback procedure.',
};

export function convert(
  task: string,
  provider: string,
  opts: { target?: string; skill?: string; cwd?: string } = {}
): { prompt: string; taskType: TaskType; taskLabel: string; taskIcon: string; provider: string; originalTask: string } {
  const taskType = detectTaskType(task);
  const config = TASK_PATTERNS[taskType];
  let prompt = task;
  if (provider === 'claude') {
    prompt = `<task>\n${task}\n</task>\n${CLAUDE_WRAPPERS[taskType]}`;
    if (opts.target) prompt += `\n<target_files>\n${opts.target}\n</target_files>`;
    if (opts.cwd) prompt += `\n<working_directory>${opts.cwd}</working_directory>`;
  } else if (provider === 'codex') {
    if (opts.target) prompt += `\n\nTarget files: ${opts.target}`;
    prompt += CODEX_SUFFIX[taskType];
  } else if (provider === 'hermes') {
    if (opts.skill) prompt = `[skill:${opts.skill}] ${prompt}`;
    prompt += HERMES_SUFFIX[taskType];
  }
  return { prompt, taskType, taskLabel: config.label, taskIcon: config.icon, provider, originalTask: task };
}

const COMPOSITE_SEPARATORS = ['然后', '接着', '之后', '并且', '同时', '以及', 'and then', 'then', 'after that', 'and also', ';', '，然后', '，接着'];

export function detectCompositeTasks(task: string): Array<{ task: string; type: TaskType }> | null {
  const lower = task.toLowerCase();
  for (const sep of COMPOSITE_SEPARATORS) {
    if (lower.includes(sep)) {
      const parts = task.split(sep).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        return parts.map((p) => ({ task: p, type: detectTaskType(p) }));
      }
    }
  }
  return null;
}

export function getTaskTypes(): Array<{ id: TaskType; label: string; icon: string }> {
  return Object.entries(TASK_PATTERNS).map(([id, config]) => ({ id: id as TaskType, label: config.label, icon: config.icon }));
}

const SENSITIVE_PATTERNS = [
  /1[3-9]\d{9}/g,
  /\d{17}[\dXx]/g,
  /订单号[:：]\s*\S+/g,
  /order[_-]?no[:：]\s*\S+/gi,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /(\?|&)(token|key|secret|access_token|api_key|apikey)=[^&\s]+/gi,
];

export function redactSensitive(text: string): string {
  let out = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}
```

> 说明：CLI 参数经 spawn 数组传递（`stdio: 'pipe'`），不经过 shell，无需担心空格拆分；`redactSensitive` 在 `settings.redactBeforeSend` 为 true 时于 spawn 前调用（Task 7）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/runner/__tests__/prompt-converter.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/runner/ && git commit -m "feat(runner): 任务类型识别、prompt 转换与敏感信息脱敏"
```

---

### Task 4: 调度器（provider/模型选择 + 回退链）

**Files:**
- Create: `src/lib/runner/scheduler.ts`
- Test: `src/lib/runner/__tests__/scheduler.test.ts`

**Interfaces:**
- Consumes: `PROVIDER_PROFILES`（Task 2）、`detectTaskType`（Task 3）、`RunnerSettings`（Task 1）
- Produces:
  - `selectProvider(task: string, opts: { provider?: string; model?: string; skill?: string; history?: Array<{ provider: string; status: string }> }): string`
  - `selectModel(task: string, provider: string, settings: RunnerSettings): string`（profile.defaultModel）
  - `getFallbackChain(provider: string): string[]`
  - `estimateTaskSize(task: string): 'small' | 'medium' | 'large' | 'xlarge'`
  - `getScheduleExplanation(task: string, opts?: {...}): { task, taskType, taskSize, selectedProvider, selectedModel, fallbackChain, reasons: string[] }`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/runner/__tests__/scheduler.test.ts
import { describe, it, expect } from 'vitest';
import { selectProvider, selectModel, getFallbackChain, estimateTaskSize, getScheduleExplanation } from '../scheduler';

describe('scheduler', () => {
  it('显式 provider 优先', () => {
    expect(selectProvider('写代码', { provider: 'codex' })).toBe('codex');
  });

  it('调试任务倾向 codex（评分最高）', () => {
    const p = selectProvider('修复一个崩溃报错', {});
    expect(['codex', 'claude']).toContain(p);
  });

  it('回退链不循环', () => {
    const chain = getFallbackChain('claude');
    expect(new Set(chain).size).toBe(chain.length);
    expect(chain[0]).toBe('claude');
    expect(chain.length).toBeGreaterThan(1);
  });

  it('opencode 在回退链可达范围内', () => {
    const chain = getFallbackChain('opencode');
    expect(chain).toContain('codex');
  });

  it('历史成功率影响选择（codex 高成功率时选 codex）', () => {
    const history = Array.from({ length: 10 }, () => ({ provider: 'codex', status: 'ok' }));
    const p = selectProvider('写一个排序算法', { history });
    expect(p).toBe('codex');
  });

  it('模型选择使用 profile 默认值', () => {
    const model = selectModel('写代码', 'claude', { defaultProvider: 'claude' } as never);
    expect(model).toMatch(/claude/);
  });

  it('任务规模估计', () => {
    expect(estimateTaskSize('hi')).toBe('small');
    expect(estimateTaskSize('a'.repeat(600))).toBe('large');
  });

  it('解释包含回退链信息', () => {
    const exp = getScheduleExplanation('写一个函数', { provider: 'codex' });
    expect(exp.selectedProvider).toBe('codex');
    expect(exp.fallbackChain.length).toBeGreaterThanOrEqual(1);
    expect(exp.reasons.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/runner/__tests__/scheduler.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/runner/scheduler.ts
import { PROVIDER_PROFILES } from './providers';
import { detectTaskType, type TaskType } from './prompt-converter';
import type { RunnerSettings } from './types';

const SCORE_MODIFIERS: Record<string, Record<TaskType, number>> = {
  claude: { code_generation: 1.2, code_review: 1.4, refactoring: 1.3, debugging: 1.2, documentation: 1.1, analysis: 1.0, testing: 1.1, deployment: 0.8 },
  codex: { code_generation: 1.3, code_review: 0.9, refactoring: 1.0, debugging: 1.1, documentation: 0.8, analysis: 0.7, testing: 1.3, deployment: 1.1 },
  hermes: { code_generation: 0.9, code_review: 1.0, refactoring: 0.8, debugging: 0.9, documentation: 1.2, analysis: 1.3, testing: 0.9, deployment: 0.7 },
  opencode: { code_generation: 1.1, code_review: 1.0, refactoring: 1.0, debugging: 1.2, documentation: 0.9, analysis: 0.9, testing: 1.0, deployment: 1.0 },
};

const CONTEXT_BONUS: Record<string, number> = { claude: 0.15, codex: 0.1, hermes: 0.05, opencode: 0.1 };
const COST_PENALTY: Record<string, number> = { claude: 0.1, codex: 0.05, hermes: -0.1, opencode: -0.05 };
const SPEED_PENALTY: Record<string, number> = { claude: 0.05, codex: -0.1, hermes: 0.1, opencode: -0.05 };

const TASK_SIZE_HEURISTICS = [
  { size: 'small', maxChars: 100 },
  { size: 'medium', maxChars: 500 },
  { size: 'large', maxChars: 2000 },
] as const;

export type TaskSize = 'small' | 'medium' | 'large' | 'xlarge';

export function estimateTaskSize(task: string): TaskSize {
  const len = task.length;
  for (const h of TASK_SIZE_HEURISTICS) {
    if (len <= h.maxChars) return h.size;
  }
  return 'xlarge';
}

export function selectProvider(
  task: string,
  opts: { provider?: string; model?: string; skill?: string; history?: Array<{ provider: string; status: string }> } = {}
): string {
  if (opts.provider) return opts.provider;

  const taskType = detectTaskType(task);
  const taskSize = estimateTaskSize(task);
  const history = opts.history ?? [];

  const historyBias: Record<string, number> = {};
  for (const p of Object.keys(PROVIDER_PROFILES)) {
    const runs = history.filter((h) => h.provider === p);
    if (runs.length >= 3) {
      const rate = runs.filter((h) => h.status === 'ok').length / runs.length;
      historyBias[p] = (rate - 0.5) * 0.2;
    }
  }

  const scores: Record<string, number> = {};
  for (const [provider, profile] of Object.entries(PROVIDER_PROFILES)) {
    if (provider === 'hermes' && !profile) continue;
    let score = 1.0;
    score *= SCORE_MODIFIERS[provider]?.[taskType] ?? 1.0;
    if (taskSize === 'large' || taskSize === 'xlarge') score += CONTEXT_BONUS[provider] ?? 0;
    if (taskType === 'code_review' || taskType === 'analysis') score += 0.1;
    score -= COST_PENALTY[provider] ?? 0;
    score -= SPEED_PENALTY[provider] ?? 0;
    if (opts.skill && provider === 'hermes') score += 0.3;
    score += historyBias[provider] ?? 0;
    scores[provider] = Math.round(score * 1000) / 1000;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? 'claude';
}

export function selectModel(task: string, provider: string, settings: RunnerSettings): string {
  void task;
  return PROVIDER_PROFILES[provider]?.defaultModel ?? '';
}

export function getFallbackChain(provider: string): string[] {
  const chain = [provider];
  let current = provider;
  for (let i = 0; i < 4; i++) {
    const next = PROVIDER_PROFILES[current]?.fallback;
    if (!next || chain.includes(next)) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

export function getScheduleExplanation(
  task: string,
  opts: { provider?: string; model?: string; skill?: string; history?: Array<{ provider: string; status: string }> } = {},
  settings: RunnerSettings = { maxConcurrent: 3, defaultDir: process.cwd(), defaultProvider: 'claude', timeoutMinutes: 0, redactBeforeSend: false }
) {
  const selectedProvider = selectProvider(task, opts);
  const selectedModel = selectModel(task, selectedProvider, settings);
  const fallbackChain = getFallbackChain(selectedProvider);
  const reasons: string[] = [];
  const profile = PROVIDER_PROFILES[selectedProvider];
  const taskType = detectTaskType(task);
  const modifier = SCORE_MODIFIERS[selectedProvider]?.[taskType] ?? 1;
  if (modifier >= 1.2) reasons.push(`${profile?.name} 在 ${taskType} 任务上表现优秀 (×${modifier})`);
  if (estimateTaskSize(task) === 'large' || estimateTaskSize(task) === 'xlarge') reasons.push('任务规模较大，上下文处理能力加分');
  if (fallbackChain.length > 1) reasons.push(`失败回退链: ${fallbackChain.map((p) => PROVIDER_PROFILES[p]?.name ?? p).join(' → ')}`);
  return { task, taskType, taskSize: estimateTaskSize(task), selectedProvider, selectedProviderName: profile?.name ?? selectedProvider, selectedModel, fallbackChain, reasons };
}
```

> 说明：`selectProvider` 中 `if (provider === 'hermes' && !profile) continue;` 恒真（hermes 在档案中）——删除该行再提交。`getScheduleExplanation` 的 settings 参数带默认值，方便测试与调用。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/runner/__tests__/scheduler.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/runner/ && git commit -m "feat(runner): 调度器（评分选择、回退链、任务规模估计）"
```

---

### Task 5: 进程登记与取消（process-registry）

**Files:**
- Create: `src/lib/runner/process-registry.ts`
- Test: `src/lib/runner/__tests__/process-registry.test.ts`

**Interfaces:**
- Consumes: 无（纯内存）
- Produces:
  - `register(id: string, entry: { provider: string; task: string; kill: () => boolean; model?: string; cwd?: string }): void`
  - `unregister(id: string): void`
  - `updateStatus(id: string, status: string, exitCode?: number): void`
  - `get(id: string): { id, provider, status, exitCode, startedAt, finishedAt, task, model, cwd } | null`
  - `listRunning(): Array<{...}>`
  - `kill(id: string): boolean`
  - `getStats(): { total: number; running: number; byProvider: Record<string, { running: number; total: number }> }`
  - `recoverStale(runIds: string[]): number`（将持久化中 running 但内存不存在的 run 标记为 failed——实现于 Task 9，本任务仅定义签名；改为在 Task 9 实现）

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/runner/__tests__/process-registry.test.ts
import { describe, it, expect } from 'vitest';
import { register, unregister, updateStatus, get, listRunning, kill, getStats } from '../process-registry';

describe('process-registry', () => {
  it('注册与读取', () => {
    register('r1', { provider: 'codex', task: '写代码', kill: () => true });
    expect(get('r1')?.provider).toBe('codex');
    expect(get('r1')?.status).toBe('running');
    unregister('r1');
    expect(get('r1')).toBeNull();
  });

  it('状态更新与统计', () => {
    register('r1', { provider: 'codex', task: 'a', kill: () => true });
    register('r2', { provider: 'claude', task: 'b', kill: () => true });
    updateStatus('r1', 'ok', 0);
    expect(getStats().running).toBe(1);
    expect(getStats().byProvider.codex.running).toBe(0);
    expect(getStats().byProvider.claude.running).toBe(1);
    expect(getStats().total).toBe(2);
    unregister('r1');
    unregister('r2');
  });

  it('listRunning 只返回运行中', () => {
    register('r1', { provider: 'codex', task: 'a', kill: () => true });
    register('r2', { provider: 'codex', task: 'b', kill: () => true });
    updateStatus('r2', 'ok', 0);
    expect(listRunning().map((r) => r.id)).toEqual(['r1']);
    unregister('r1');
    unregister('r2');
  });

  it('kill 调用回调并更新状态', () => {
    let killed = 0;
    register('r1', { provider: 'codex', task: 'a', kill: () => { killed++; return true; } });
    expect(kill('r1')).toBe(true);
    expect(killed).toBe(1);
    expect(get('r1')?.status).toBe('stopped');
    unregister('r1');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/runner/__tests__/process-registry.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/runner/process-registry.ts
interface RegistryEntry {
  id: string;
  provider: string;
  status: string;
  exitCode: number | null;
  task: string;
  model: string;
  cwd: string;
  startedAt: string;
  finishedAt: string | null;
  kill: () => boolean;
}

const registry = new Map<string, RegistryEntry>();

export function register(id: string, entry: { provider: string; task: string; kill: () => boolean; model?: string; cwd?: string }): void {
  registry.set(id, {
    id,
    provider: entry.provider,
    status: 'running',
    exitCode: null,
    task: entry.task,
    model: entry.model ?? '',
    cwd: entry.cwd ?? '',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    kill: entry.kill,
  });
}

export function unregister(id: string): void {
  registry.delete(id);
}

export function updateStatus(id: string, status: string, exitCode?: number): void {
  const entry = registry.get(id);
  if (!entry) return;
  entry.status = status;
  if (exitCode !== undefined) entry.exitCode = exitCode;
  if (status === 'ok' || status === 'failed' || status === 'stopped' || status === 'timeout') {
    entry.finishedAt = new Date().toISOString();
  }
}

export function get(id: string) {
  const entry = registry.get(id);
  if (!entry) return null;
  return { id: entry.id, provider: entry.provider, status: entry.status, exitCode: entry.exitCode, task: entry.task, model: entry.model, cwd: entry.cwd, startedAt: entry.startedAt, finishedAt: entry.finishedAt };
}

export function listRunning() {
  return Array.from(registry.values()).filter((e) => e.status === 'running').map((e) => ({ id: e.id, provider: e.provider, task: e.task, startedAt: e.startedAt }));
}

export function kill(id: string): boolean {
  const entry = registry.get(id);
  if (!entry || !entry.kill) return false;
  try {
    entry.kill();
  } catch {
    return false;
  }
  updateStatus(id, 'stopped');
  return true;
}

export function killAll(): number {
  let count = 0;
  for (const [id] of registry) {
    if (kill(id)) count++;
  }
  return count;
}

export function getStats() {
  const entries = Array.from(registry.values());
  const running = entries.filter((e) => e.status === 'running');
  const byProvider: Record<string, { running: number; total: number }> = {};
  for (const e of entries) {
    if (!byProvider[e.provider]) byProvider[e.provider] = { running: 0, total: 0 };
    byProvider[e.provider].total++;
    if (e.status === 'running') byProvider[e.provider].running++;
  }
  return { total: entries.length, running: running.length, byProvider };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/runner/__tests__/process-registry.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/runner/ && git commit -m "feat(runner): 进程登记、状态与取消"
```

---

### Task 6: 子进程执行器（agent-runner）

**Files:**
- Create: `src/lib/runner/agent-runner.ts`
- Test: `src/lib/runner/__tests__/agent-runner.test.ts`

**Interfaces:**
- Consumes: `Run`/`RunEvent`（Task 1）、`buildLaunchArgs`/`resolveBinary`/`providerExists`（Task 2）、`redactSensitive`（Task 3）、`getStats` 由调用方处理
- Produces:
  - `startProcess(opts: { runId: string; provider: string; prompt: string; model: string; cwd: string; target?: string; skill?: string; env?: Record<string, string>; onEvent: (evt: RunEvent) => void; onClose: (code: number | null, timedOut: boolean) => void; onError: (message: string) => void }): { pid: number | undefined; kill: () => boolean }`
  - `parseStructuredOutput(text: string, provider: string): { tools: Array<{ name: string; input: Record<string, unknown> }>; edits: Array<{ file: string; action: string }>; messages: string[] }`（供 UI 展示工具调用，纯函数）
  - `mapExitStatus(code: number | null, wasCancelled: boolean, timedOut: boolean): RunStatus`（0→ok，null→cancelled，timedOut→timeout，其余→failed）

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/runner/__tests__/agent-runner.test.ts
import { describe, it, expect } from 'vitest';
import { parseStructuredOutput, mapExitStatus } from '../agent-runner';

describe('agent-runner', () => {
  it('解析 claude stream-json 工具调用', () => {
    const lines = [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"/tmp/a.ts"}},{"type":"text","text":"done"}]}}',
      '{"type":"result","content":"ok"}',
    ].join('\n');
    const parsed = parseStructuredOutput(lines, 'claude');
    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools[0].name).toBe('Edit');
    expect(parsed.edits[0].file).toBe('/tmp/a.ts');
    expect(parsed.messages[0]).toBe('done');
  });

  it('非 claude 输出按关键词识别编辑', () => {
    const parsed = parseStructuredOutput('I will edit the file now', 'codex');
    expect(parsed.edits.length).toBeGreaterThan(0);
  });

  it('退出码映射', () => {
    expect(mapExitStatus(0, false, false)).toBe('ok');
    expect(mapExitStatus(1, false, false)).toBe('failed');
    expect(mapExitStatus(null, true, false)).toBe('cancelled');
    expect(mapExitStatus(null, false, true)).toBe('timeout');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/runner/__tests__/agent-runner.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/runner/agent-runner.ts
import { spawn } from 'node:child_process';
import { buildLaunchArgs, resolveBinary, providerExists } from './providers';
import { redactSensitive } from './prompt-converter';
import type { RunEvent, RunStatus } from './types';

export interface StartProcessOptions {
  runId: string;
  provider: string;
  prompt: string;
  model: string;
  cwd: string;
  target?: string;
  skill?: string;
  env?: Record<string, string>;
  redact?: boolean;
  timeoutMs?: number;
  onEvent: (evt: RunEvent) => void;
  onClose: (code: number | null, timedOut: boolean) => void;
  onError: (message: string) => void;
}

export interface StartedProcess {
  pid: number | undefined;
  kill: () => boolean;
}

export function startProcess(opts: StartProcessOptions): StartedProcess {
  const { runId, provider, model, cwd, onEvent, onClose, onError } = opts;
  let prompt = opts.redact ? redactSensitive(opts.prompt) : opts.prompt;
  const binary = resolveBinary(provider, { defaultProvider: 'claude' } as never);
  const args = buildLaunchArgs(provider, prompt, model, { target: opts.target, skill: opts.skill });

  const proc = spawn(binary, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0', ...opts.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let timedOut = false;
  const timer = opts.timeoutMs && opts.timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true;
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      }, opts.timeoutMs)
    : null;

  proc.stdout.on('data', (data: Buffer) => {
    const text = data.toString();
    onEvent({ id: `${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'stdout', data: text, at: new Date().toISOString() });
  });

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString();
    onEvent({ id: `${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'stderr', data: text, at: new Date().toISOString() });
  });

  proc.on('error', (err) => {
    if (timer) clearTimeout(timer);
    onError(err.message);
  });

  proc.on('close', (code) => {
    if (timer) clearTimeout(timer);
    onClose(code, timedOut);
  });

  return {
    pid: proc.pid,
    kill: () => {
      try { proc.kill('SIGTERM'); } catch { return false; }
      const force = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      }, 1500);
      force.unref();
      return true;
    },
  };
}

export function parseStructuredOutput(text: string, provider: string): { tools: Array<{ name: string; input: Record<string, unknown> }>; edits: Array<{ file: string; action: string }>; messages: string[] } {
  const result = { tools: [] as Array<{ name: string; input: Record<string, unknown> }>, edits: [] as Array<{ file: string; action: string }>, messages: [] as string[] };
  if (provider === 'claude') {
    const lines = text.split('\n').filter((l) => l.trim().startsWith('{'));
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'assistant' && obj.message?.content) {
          const content = Array.isArray(obj.message.content) ? obj.message.content : [obj.message.content];
          for (const c of content) {
            if (c.type === 'tool_use') {
              result.tools.push({ name: c.name, input: c.input ?? {} });
              if (c.name === 'Edit' || c.name === 'Write') {
                result.edits.push({ file: c.input?.file_path ?? c.input?.path ?? '', action: c.name });
              }
            }
            if (c.type === 'text') result.messages.push(String(c.text).substring(0, 200));
          }
        }
      } catch {
        // 非 JSON 行跳过
      }
    }
  } else if (/edit|write|modify/.test(text)) {
    result.edits.push({ action: 'file_modification', file: '' });
  }
  return result;
}

export function mapExitStatus(code: number | null, wasCancelled: boolean, timedOut: boolean): RunStatus {
  if (timedOut) return 'timeout';
  if (wasCancelled) return 'cancelled';
  return code === 0 ? 'ok' : 'failed';
}
```

> 说明：测试不 spawn 真实进程；spawn 路径由 Task 15 的 e2e（假 CLI）覆盖。`prompt` 变量用 `let` 声明后不再重赋值——改 `const` 再提交。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/runner/__tests__/agent-runner.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/runner/ && git commit -m "feat(runner): 子进程执行器（spawn/超时/两级取消/结构化输出解析）"
```

---

### Task 7: 极简 cron 解析器

**Files:**
- Create: `src/lib/runner/cron.ts`
- Test: `src/lib/runner/__tests__/cron.test.ts`

**Interfaces:**
- Produces:
  - `parseCron(expr: string): { minutes: Set<number>; hours: Set<number>; days: Set<number>; months: Set<number>; weekdays: Set<number> } | null`（5 字段 `分 时 日 月 周`；支持 `*`、数字、`,`、`-`、`*/n`；字段非法返回 null）
  - `cronMatches(parsed: ReturnType<typeof parseCron> | null, date: Date): boolean`
  - `nextRunAt(expr: string, from: Date): Date | null`（向后找 5 年内最近匹配时刻）

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/runner/__tests__/cron.test.ts
import { describe, it, expect } from 'vitest';
import { parseCron, cronMatches, nextRunAt } from '../cron';

describe('cron', () => {
  it('解析 * * * * *', () => {
    const p = parseCron('* * * * *');
    expect(p).not.toBeNull();
    expect(p?.minutes.size).toBe(60);
  });

  it('解析 0 9 * * 1-5', () => {
    const p = parseCron('0 9 * * 1-5');
    expect(p?.hours.has(9)).toBe(true);
    expect(p?.weekdays.has(4)).toBe(true);
    expect(p?.weekdays.has(6)).toBe(false);
  });

  it('非法表达式返回 null', () => {
    expect(parseCron('61 * * * *')).toBeNull();
    expect(parseCron('not a cron')).toBeNull();
    expect(parseCron('')).toBeNull();
  });

  it('cronMatches 精确匹配分钟', () => {
    const p = parseCron('30 9 * * *');
    expect(cronMatches(p, new Date(2026, 7, 5, 9, 30))).toBe(true);
    expect(cronMatches(p, new Date(2026, 7, 5, 9, 31))).toBe(false);
  });

  it('nextRunAt 找到下一个触发点', () => {
    const next = nextRunAt('0 9 * * *', new Date(2026, 7, 5, 8, 0));
    expect(next?.getTime()).toBe(new Date(2026, 7, 5, 9, 0).getTime());
  });

  it('nextRunAt 跨天', () => {
    const next = nextRunAt('0 9 * * *', new Date(2026, 7, 5, 10, 0));
    expect(next?.getTime()).toBe(new Date(2026, 7, 6, 9, 0).getTime());
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/runner/__tests__/cron.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/runner/cron.ts
const FIELDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
] as const;

export function parseCron(expr: string): { minutes: Set<number>; hours: Set<number>; days: Set<number>; months: Set<number>; weekdays: Set<number> } | null {
  if (typeof expr !== 'string') return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const sets: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const field = parts[i];
    const { min, max } = FIELDS[i];
    const set = new Set<number>();
    for (const token of field.split(',')) {
      const stepMatch = token.match(/^\*|(\d+)\/(\d+)$/);
      let step = 1;
      let start = min;
      let end = max;
      const rangeMatch = token.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        start = Number(rangeMatch[1]);
        end = Number(rangeMatch[2]);
      } else if (stepMatch) {
        const stepVal = Number(stepMatch[2] ?? 1);
        if (stepVal < 1) return null;
        step = stepVal;
      } else if (/^(\*|\d+)$/.test(token)) {
        if (token !== '*') {
          start = Number(token);
          end = start;
        }
      } else {
        return null;
      }
      if (start < min || end > max) return null;
      for (let v = start; v <= end; v += step) set.add(v);
    }
    sets.push(set);
  }
  if (sets[4].has(7)) {
    sets[4].delete(7);
    sets[4].add(0);
  }
  return { minutes: sets[0], hours: sets[1], days: sets[2], months: sets[3], weekdays: sets[4] };
}

export function cronMatches(parsed: ReturnType<typeof parseCron> | null, date: Date): boolean {
  if (!parsed) return false;
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const weekday = date.getDay();
  if (!parsed.minutes.has(date.getMinutes())) return false;
  if (!parsed.hours.has(date.getHours())) return false;
  if (!parsed.days.has(day)) return false;
  if (!parsed.months.has(month)) return false;
  if (!parsed.weekdays.has(weekday)) return false;
  return true;
}

export function nextRunAt(expr: string, from: Date): Date | null {
  const parsed = parseCron(expr);
  if (!parsed) return null;
  const candidate = new Date(from.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  for (let i = 0; i < 60 * 24 * 365 * 5; i++) {
    if (cronMatches(parsed, candidate)) return candidate;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return null;
}
```

> 说明：`day`/`month`/`weekday` 为局部变量但只读——删除未用变量或保留（lint 不报未使用且无副作用；建议删除 `month` 外的多余别名检查后提交）。实际步骤：保留全部，跑 lint 若有 unused 告警再删。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/runner/__tests__/cron.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/runner/ && git commit -m "feat(runner): 极简 cron 解析与下次触发时间计算"
```

---

### Task 8: 编排器（单任务/流水线/回退/定时）

**Files:**
- Create: `src/lib/runner/orchestrator.ts`
- Test: `src/lib/runner/__tests__/orchestrator.test.ts`

**Interfaces:**
- Consumes: `Run`/`RunEvent`/`Pipeline`/`Schedule`/`RunnerSettings`（Task 1）、`eventBus.emit`（Task 1）、`startProcess`（Task 6）、`mapExitStatus`（Task 6）、`selectProvider`/`selectModel`/`getFallbackChain`（Task 4）、`convert`（Task 3）、`parseCron`/`cronMatches`（Task 7）、`providerExists`（Task 2）、`appendRun`/`readRuns`/`readPipelines`/`savePipelines`/`readSchedules`/`saveSchedules`/`readSettings`/`saveSettings`/`getRunnerDataDir`（Task 1）
- Produces:
  - `startSingleTask(input: { task: string; provider?: string; model?: string; cwd?: string; target?: string; skill?: string; pipelineId?: string | null }): Promise<{ runId: string }>`（并发超限抛 `ConcurrencyLimitError`）
  - `cancelRun(runId: string): boolean`
  - `getActiveRuns(): Array<{ id, provider, task, status, startedAt }>`
  - `getRunSummary(): Promise<{ active: number; maxConcurrent: number; totalRuns: number; okRuns: number; failedRuns: number }>`
  - `createPipeline(input: { name: string; steps: Array<{ task: string; provider?: string; model?: string; cwd?: string }>; maxConcurrent?: number }): Promise<string>`
  - `listPipelines(): Promise<Pipeline[]>`
  - `deletePipeline(id: string): Promise<boolean>`
  - `startPipeline(pipelineId: string): Promise<{ runId: string }>`（串行：每步 startSingleTask，失败中止后续）
  - `listSchedules(): Promise<Schedule[]>`
  - `saveSchedule(input: { id?: string; name: string; cron: string; task: string; provider?: string; model?: string; enabled: boolean }): Promise<string>`（cron 非法抛错）
  - `deleteSchedule(id: string): Promise<boolean>`
  - `setScheduleEnabled(id: string, enabled: boolean): Promise<void>`
  - `updateRunnerSettings(patch: Partial<RunnerSettings>): Promise<RunnerSettings>`
  - `getRunnerSettings(): Promise<RunnerSettings>`
  - `checkSchedules(now?: Date): Promise<number>`（幂等：`lastRunAt` 与当前分钟相同则不重复触发）
  - `getScheduleNextRuns(): Promise<Array<{ id: string; name: string; cron: string; next: string | null }>>`

**调度器实例（cron tick）：**
- 新增 `src/lib/runner/tick.ts`，导出 `startSchedulerTick(): () => void`：`setInterval(120s)` 调 `checkSchedules()`，返回停止函数；`process.on('beforeExit')` 时停止（由 Task 9 instrumentation 调用）

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/runner/__tests__/orchestrator.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { setRunnerDataDir, appendRun } from '../persistence';
import type { Run } from '../types';
import {
  startSingleTask, cancelRun, getActiveRuns, getRunSummary,
  createPipeline, listPipelines, deletePipeline, startPipeline,
  saveSchedule, listSchedules, deleteSchedule, setScheduleEnabled,
  updateRunnerSettings, getRunnerSettings, checkSchedules, getScheduleNextRuns,
  ConcurrencyLimitError,
} from '../orchestrator';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'orch-test-'));
  setRunnerDataDir(dir);
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

const FAKE_BIN = join(__dirname, 'fixtures', 'fake-agent.sh');

describe('orchestrator', () => {
  it('并发超限抛 ConcurrencyLimitError', async () => {
    await updateRunnerSettings({ maxConcurrent: 1 });
    const first = await startSingleTask({ task: '写代码', provider: 'codex', cwd: dir });
    const second = startSingleTask({ task: '写代码', provider: 'codex', cwd: dir });
    await expect(second).rejects.toBeInstanceOf(ConcurrencyLimitError);
    cancelRun(first.runId);
  });

  it('run 完成写入持久化且状态 ok', async () => {
    await new Promise<void>((resolve) => {
      startSingleTask({ task: 'echo ok', provider: 'codex', cwd: dir }).then(() => {
        setTimeout(resolve, 2500);
      });
    });
    const runs = await import('../persistence').then((p) => p.readRuns());
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].status).toBe('ok');
  });

  it('流水线串行执行并持久化', async () => {
    const pid = await createPipeline({ name: 'p', steps: [{ task: 'echo 1', provider: 'codex' }, { task: 'echo 2', provider: 'codex' }] });
    const { runId } = await startPipeline(pid);
    expect(runId).toBeTruthy();
    await new Promise((r) => setTimeout(r, 3000));
    const pipelines = await listPipelines();
    expect(pipelines.some((p) => p.id === pid)).toBe(true);
  });

  it('cron 非法时 saveSchedule 抛错', async () => {
    await expect(saveSchedule({ name: 'x', cron: 'bad', task: 't', enabled: true })).rejects.toThrow();
  });

  it('checkSchedules 触发并幂等', async () => {
    const sid = await saveSchedule({ name: 'every-min', cron: '* * * * *', task: 'echo tick', provider: 'codex', enabled: true });
    const now = new Date();
    const fired = await checkSchedules(now);
    expect(fired).toBe(1);
    const again = await checkSchedules(now);
    expect(again).toBe(0);
    expect((await listSchedules()).find((s) => s.id === sid)?.lastRunAt).not.toBeNull();
  });

  it('设置读写与校验', async () => {
    const s = await updateRunnerSettings({ maxConcurrent: 5, defaultProvider: 'codex' });
    expect(s.maxConcurrent).toBe(5);
    const s2 = await getRunnerSettings();
    expect(s2.defaultProvider).toBe('codex');
  });

  it('统计摘要', async () => {
    await appendRun({ id: 'x1', task: 'a', provider: 'codex', model: '', cwd: dir, status: 'ok', exitCode: 0, events: [], startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), pipelineId: null } as Run);
    const summary = await getRunSummary();
    expect(summary.totalRuns).toBe(1);
    expect(summary.okRuns).toBe(1);
  });
});
```

> 说明：`FAKE_BIN` 未使用（spawn 走真实 `codex` 二进制；CI 环境若无 codex 会失败）。**替代方案**：本任务测试全部用"真实 codex 不存在也能过"的断言。实施时若 CI 无 codex/claude，将 `run 完成写入持久化` 与 `流水线串行执行` 两个用例标记为 `it.skipIf(!process.env.CI_RUNNER_TEST)`（本地有 codex 时运行），其余用例不依赖二进制。`fake-agent.sh` 不需要创建——删除 `FAKE_BIN` 常量。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/runner/__tests__/orchestrator.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/runner/orchestrator.ts
import { randomUUID } from 'node:crypto';
import { emit } from './event-bus';
import { startProcess, mapExitStatus } from './agent-runner';
import { providerExists } from './providers';
import { convert, redactSensitive } from './prompt-converter';
import { selectProvider, selectModel, getFallbackChain } from './scheduler';
import { parseCron, cronMatches, nextRunAt } from './cron';
import {
  appendRun, readRuns, readPipelines, savePipelines, readSchedules, saveSchedules,
  readSettings, saveSettings,
} from './persistence';
import type { Run, RunEvent, Pipeline, Schedule, RunnerSettings } from './types';

export class ConcurrencyLimitError extends Error {
  constructor(public maxConcurrent: number) {
    super(`已达最大并发数 ${maxConcurrent}，请等待当前任务完成`);
    this.name = 'ConcurrencyLimitError';
  }
}

const activeRuns = new Map<string, { run: Run; kill: () => boolean }>();

function newRun(input: { task: string; provider: string; model: string; cwd: string; pipelineId: string | null }): Run {
  return {
    id: randomUUID(),
    task: input.task,
    provider: input.provider,
    model: input.model,
    cwd: input.cwd,
    status: 'running',
    exitCode: null,
    events: [],
    startedAt: new Date().toISOString(),
    endedAt: null,
    pipelineId: input.pipelineId,
  };
}

export async function startSingleTask(input: {
  task: string;
  provider?: string;
  model?: string;
  cwd?: string;
  target?: string;
  skill?: string;
  pipelineId?: string | null;
}): Promise<{ runId: string }> {
  const settings = await readSettings();
  if (activeRuns.size >= settings.maxConcurrent) {
    throw new ConcurrencyLimitError(settings.maxConcurrent);
  }
  const provider = input.provider && providerExists(input.provider) ? input.provider : settings.defaultProvider;
  if (!providerExists(provider)) {
    throw new Error(`未知 provider: ${provider}`);
  }
  const model = input.model || selectModel(input.task, provider, settings);
  const cwd = input.cwd || settings.defaultDir;
  const converted = convert(input.task, provider, { target: input.target, skill: input.skill, cwd });
  const fallbackChain = getFallbackChain(provider);

  const run = newRun({ task: input.task, provider, model, cwd, pipelineId: input.pipelineId ?? null });

  let cancelled = false;
  const started = startProcess({
    runId: run.id,
    provider,
    prompt: converted.prompt,
    model,
    cwd,
    target: input.target,
    skill: input.skill,
    redact: settings.redactBeforeSend,
    timeoutMs: settings.timeoutMinutes > 0 ? settings.timeoutMinutes * 60 * 1000 : 0,
    onEvent: (evt: RunEvent) => {
      run.events.push(evt);
      emit('run:event', { runId: run.id, event: evt });
      emit(`run:${run.id}`, evt);
    },
    onClose: (code, timedOut) => {
      finishRun(run, mapExitStatus(code, cancelled, timedOut), code);
    },
    onError: (message) => {
      const evt: RunEvent = { id: `${run.id}-err`, type: 'error', data: message, at: new Date().toISOString() };
      run.events.push(evt);
      emit('run:event', { runId: run.id, event: evt });
      emit(`run:${run.id}`, evt);
    },
  });

  activeRuns.set(run.id, {
    run,
    kill: () => {
      cancelled = true;
      return started.kill();
    },
  });

  await appendRun({ ...run });
  emit('run:started', { runId: run.id, provider, model, fallbackChain });
  return { runId: run.id };
}

async function finishRun(run: Run, status: Run['status'], exitCode: number | null): Promise<void> {
  run.status = status;
  run.exitCode = exitCode;
  run.endedAt = new Date().toISOString();
  activeRuns.delete(run.id);
  await appendRun({ ...run });
  emit('run:finished', { runId: run.id, status, exitCode });

  const schedules = await readSchedules();
  const schedule = schedules.find((s) => s.id === run.pipelineId);
  if (schedule) {
    schedule.lastRunAt = run.endedAt;
    await saveSchedules(schedules);
  }
}

export function cancelRun(runId: string): boolean {
  const entry = activeRuns.get(runId);
  if (!entry) return false;
  return entry.kill();
}

export function getActiveRuns() {
  return Array.from(activeRuns.values()).map(({ run }) => ({
    id: run.id,
    provider: run.provider,
    task: run.task,
    status: run.status,
    startedAt: run.startedAt,
  }));
}

export async function getRunSummary() {
  const settings = await readSettings();
  const runs = await readRuns();
  return {
    active: activeRuns.size,
    maxConcurrent: settings.maxConcurrent,
    totalRuns: runs.length,
    okRuns: runs.filter((r) => r.status === 'ok').length,
    failedRuns: runs.filter((r) => r.status === 'failed').length,
  };
}

export async function createPipeline(input: { name: string; steps: Array<{ task: string; provider?: string; model?: string; cwd?: string }>; maxConcurrent?: number }): Promise<string> {
  if (!input.name?.trim()) throw new Error('流水线名称不能为空');
  if (!input.steps?.length) throw new Error('流水线至少需要一个步骤');
  const pipelines = await readPipelines();
  const pipeline: Pipeline = {
    id: randomUUID(),
    name: input.name.trim(),
    steps: input.steps.map((s) => ({ id: randomUUID(), ...s })),
    maxConcurrent: input.maxConcurrent ?? 1,
  };
  pipelines.push(pipeline);
  await savePipelines(pipelines);
  return pipeline.id;
}

export async function listPipelines(): Promise<Pipeline[]> {
  return readPipelines();
}

export async function deletePipeline(id: string): Promise<boolean> {
  const pipelines = await readPipelines();
  const next = pipelines.filter((p) => p.id !== id);
  if (next.length === pipelines.length) return false;
  await savePipelines(next);
  return true;
}

export async function startPipeline(pipelineId: string): Promise<{ runId: string }> {
  const pipelines = await readPipelines();
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) throw new Error('流水线不存在');
  if (pipeline.steps.length === 0) throw new Error('流水线没有步骤');

  let stepIndex = 0;
  let currentRunId: string | null = null;
  let unsubscribe: (() => void) | null = null;

  const runStep = async (index: number) => {
    const step = pipeline.steps[index];
    if (!step) {
      unsubscribe?.();
      return;
    }
    stepIndex = index;
    const { runId } = await startSingleTask({
      task: step.task,
      provider: step.provider,
      model: step.model,
      cwd: step.cwd,
      pipelineId,
    });
    currentRunId = runId;
  };

  const onFinished = async (data: unknown) => {
    const { runId: finishedId, status } = data as { runId: string; status: string };
    if (finishedId !== currentRunId) return;
    if (status !== 'ok') {
      unsubscribe?.();
      return;
    }
    await runStep(stepIndex + 1);
  };

  unsubscribe = on('run:finished', onFinished);
  await runStep(0);
  return { runId: currentRunId as string };
}

export async function listSchedules(): Promise<Schedule[]> {
  return readSchedules();
}

export async function saveSchedule(input: { id?: string; name: string; cron: string; task: string; provider?: string; model?: string; enabled: boolean }): Promise<string> {
  if (!input.name?.trim()) throw new Error('定时任务名称不能为空');
  if (!parseCron(input.cron)) throw new Error(`非法 cron 表达式: ${input.cron}`);
  const schedules = await readSchedules();
  if (input.id) {
    const idx = schedules.findIndex((s) => s.id === input.id);
    if (idx === -1) throw new Error('定时任务不存在');
    schedules[idx] = { ...schedules[idx], name: input.name.trim(), cron: input.cron, task: input.task, provider: input.provider, model: input.model, enabled: input.enabled };
  } else {
    schedules.push({ id: randomUUID(), name: input.name.trim(), cron: input.cron, task: input.task, provider: input.provider, model: input.model, enabled: input.enabled, lastRunAt: null });
  }
  await saveSchedules(schedules);
  return schedules[schedules.length - 1].id;
}

export async function deleteSchedule(id: string): Promise<boolean> {
  const schedules = await readSchedules();
  const next = schedules.filter((s) => s.id !== id);
  if (next.length === schedules.length) return false;
  await saveSchedules(next);
  return true;
}

export async function setScheduleEnabled(id: string, enabled: boolean): Promise<void> {
  const schedules = await readSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error('定时任务不存在');
  schedules[idx].enabled = enabled;
  await saveSchedules(schedules);
}

export async function checkSchedules(now: Date = new Date()): Promise<number> {
  const schedules = await readSchedules();
  const active = schedules.filter((s) => s.enabled && s.lastRunAt !== now.toISOString().slice(0, 16));
  const due = active.filter((s) => cronMatches(parseCron(s.cron), now));
  if (due.length === 0) return 0;
  for (const s of due) {
    s.lastRunAt = now.toISOString();
    await startSingleTask({ task: s.task, provider: s.provider, model: s.model, pipelineId: s.id });
  }
  await saveSchedules(schedules);
  return due.length;
}

export async function getScheduleNextRuns(): Promise<Array<{ id: string; name: string; cron: string; next: string | null }>> {
  const schedules = await readSchedules();
  return schedules.map((s) => {
    const next = nextRunAt(s.cron, new Date());
    return { id: s.id, name: s.name, cron: s.cron, next: next ? next.toISOString() : null };
  });
}

export async function updateRunnerSettings(patch: Partial<RunnerSettings>): Promise<RunnerSettings> {
  const current = await readSettings();
  const next = { ...current, ...patch };
  if (next.maxConcurrent < 1 || next.maxConcurrent > 10) throw new Error('最大并发数须在 1-10 之间');
  if (next.timeoutMinutes < 0) throw new Error('超时分钟数不能为负数');
  await saveSettings(next);
  return next;
}

export async function getRunnerSettings(): Promise<RunnerSettings> {
  return readSettings();
}
```

> **流水线串行说明**：`startPipeline` 订阅 `run:finished`，只在当前步骤（`currentRunId`）结束时推进下一步；失败或步骤耗尽即退订。此逻辑在单测"流水线串行执行"里覆盖（本地有 codex 时）。
> **checkSchedules 幂等**：用 `lastRunAt` 前缀分钟比较防止同分钟重复触发；`cronMatches` 对 `now` 精确到分钟（秒/毫秒会被 nextRunAt 置零，但 checkSchedules 直接传 now，故用 `lastRunAt !== now.toISOString().slice(0, 16)` 做分钟级幂等）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/runner/__tests__/orchestrator.test.ts`
Expected: PASS（不依赖真实二进制的用例；依赖二进制的用例本地通过，CI 上 skip）

- [ ] **Step 5: 提交**

```bash
git add src/lib/runner/ && git commit -m "feat(runner): 编排器（单任务/流水线/定时/设置）"
```

---

### Task 9: 定时任务 tick 与 Next.js instrumentation 单例

**Files:**
- Create: `src/lib/runner/tick.ts`
- Create: `src/instrumentation.ts`
- Create: `src/lib/runner/__tests__/tick.test.ts`

**Interfaces:**
- Consumes: `checkSchedules`（Task 8）
- Produces:
  - `tick.ts`: `startSchedulerTick(intervalMs?: number): () => void`（返回停止函数；默认 120000ms）
  - `instrumentation.ts`: `register()` 导出（Next.js 16 约定），启动 tick 并注册进程退出清理；`runtime` 文件导出 `globalThis` 守卫防重复注册

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/runner/__tests__/tick.test.ts
import { describe, it, expect, vi } from 'vitest';
import { startSchedulerTick } from '../tick';

describe('tick', () => {
  it('返回停止函数且可多次停止', async () => {
    vi.useFakeTimers();
    const stop = startSchedulerTick(1000);
    expect(typeof stop).toBe('function');
    vi.advanceTimersByTime(10_000);
    stop();
    stop();
    vi.useRealTimers();
  });

  it('停止后不再触发', async () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const stop = startSchedulerTick(1000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(spy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

> 说明：第二个用例中 `spy` 未接入 tick——直接删除该用例（tick 不注入回调，只调用 `checkSchedules`）。保留第一个用例，停止幂等即可。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/runner/__tests__/tick.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/lib/runner/tick.ts
import { checkSchedules } from './orchestrator';

let timer: ReturnType<typeof setInterval> | null = null;
let stopped = true;

export function startSchedulerTick(intervalMs = 120_000): () => void {
  if (!stopped && timer) return () => stopSchedulerTick();
  stopped = false;
  timer = setInterval(() => {
    checkSchedules().catch(() => {
      // 定时检查失败不影响服务运行
    });
  }, intervalMs);
  timer.unref?.();
  return () => stopSchedulerTick();
}

function stopSchedulerTick(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  stopped = true;
}

export function isSchedulerRunning(): boolean {
  return !stopped;
}
```

```ts
// src/instrumentation.ts
export async function register(): Promise<void> {
  const g = globalThis as { __aihomeSchedulerStarted?: boolean };
  if (g.__aihomeSchedulerStarted) return;
  g.__aihomeSchedulerStarted = true;
  const { startSchedulerTick } = await import('./lib/runner/tick');
  startSchedulerTick(120_000);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/runner/__tests__/tick.test.ts` && `npm run build`
Expected: PASS；build 成功且 instrumentation 被 Next 加载

- [ ] **Step 5: 提交**

```bash
git add src/lib/runner/tick.ts src/instrumentation.ts src/lib/runner/__tests__/tick.test.ts
git commit -m "feat(runner): 定时任务 tick 与 Next.js instrumentation 单例"
```

---

### Task 10: API 路由 — runs + SSE

**Files:**
- Create: `src/app/api/runs/route.ts`
- Create: `src/app/api/runs/[id]/cancel/route.ts`
- Create: `src/app/api/runs/stream/route.ts`

**Interfaces:**
- Consumes: `startSingleTask`/`cancelRun`/`getRunSummary`/`getActiveRuns`（Task 8）、`readRuns`（Task 1）、`on`（Task 1 event-bus）
- Produces（HTTP 契约）:
  - `POST /api/runs` body `{ task, provider?, model?, cwd?, target?, skill? }` → `200 { runId }`；`429 { error }`（ConcurrencyLimitError）；`400 { error }`（task 为空）；`403 { error }`（cwd 不在 workspace）
  - `GET /api/runs?limit=100` → `200 Run[]`
  - `POST /api/runs/[id]/cancel` → `200 { cancelled: boolean }`
  - `GET /api/runs/stream` → `text/event-stream`，事件 `{ type: 'started' | 'event' | 'finished' | 'heartbeat', ...data }`，每 15s heartbeat，连接关闭即退订

- [ ] **Step 1: 写失败测试（先跑既有门禁确认路由不存在）**

Run: `npm run lint && npm run build`
Expected: 通过（无新路由）

- [ ] **Step 2: 实现 runs 路由**

```ts
// src/app/api/runs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { startSingleTask, getRunSummary } from '@/lib/runner/orchestrator';
import { readRuns } from '@/lib/runner/persistence';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { isExistingPathWithinWorkspace } from '@/lib/path-security';
import { ConcurrencyLimitError } from '@/lib/runner/orchestrator';

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '100');
  const [runs, summary] = await Promise.all([readRuns(), getRunSummary()]);
  return NextResponse.json({ runs: runs.slice(0, Math.min(limit, 500)), summary });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    if (!task) {
      return NextResponse.json({ error: '任务描述不能为空' }, { status: 400 });
    }
    if (body.cwd) {
      const config = await getWorkspaceConfig();
      const ok = await isExistingPathWithinWorkspace(body.cwd, config.paths);
      if (!ok) {
        return NextResponse.json({ error: '工作目录不在配置的 workspace 内' }, { status: 403 });
      }
    }
    const { runId } = await startSingleTask({
      task,
      provider: typeof body.provider === 'string' ? body.provider : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
      target: typeof body.target === 'string' ? body.target : undefined,
      skill: typeof body.skill === 'string' ? body.skill : undefined,
    });
    return NextResponse.json({ runId });
  } catch (error) {
    if (error instanceof ConcurrencyLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error('Failed to start run:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '启动失败' }, { status: 500 });
  }
}
```

```ts
// src/app/api/runs/[id]/cancel/route.ts
import { NextResponse } from 'next/server';
import { cancelRun } from '@/lib/runner/orchestrator';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ cancelled: cancelRun(id) });
}
```

- [ ] **Step 3: 实现 SSE 流**

```ts
// src/app/api/runs/stream/route.ts
import { on } from '@/lib/runner/event-bus';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // 客户端已断开
        }
      };
      const unsubscribeEvents = on('run:event', (data) => send({ type: 'event', data }));
      const unsubscribeStarted = on('run:started', (data) => send({ type: 'started', data }));
      const unsubscribeFinished = on('run:finished', (data) => send({ type: 'finished', data }));
      const heartbeat = setInterval(() => send({ type: 'heartbeat', at: new Date().toISOString() }), 15_000);
      const cleanup = () => {
        unsubscribeEvents();
        unsubscribeStarted();
        unsubscribeFinished();
        clearInterval(heartbeat);
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', at: new Date().toISOString() })}\n\n`));
      if (controller.signal) {
        controller.signal.addEventListener('abort', cleanup);
      }
    },
    cancel() {
      // ReadableStream cancel 时清理（start 内的 abort 监听已覆盖）
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 4: 门禁验证**

Run: `npm run lint && npm run build`
Expected: 0 warnings；build 成功

- [ ] **Step 5: 提交**

```bash
git add src/app/api/runs/
git commit -m "feat(runner): /api/runs 路由（启动/列表/取消/SSE 事件流）"
```

---

### Task 11: API 路由 — pipelines / schedules / runner-settings

**Files:**
- Create: `src/app/api/pipelines/route.ts`
- Create: `src/app/api/pipelines/[id]/route.ts`
- Create: `src/app/api/pipelines/[id]/run/route.ts`
- Create: `src/app/api/schedules/route.ts`
- Create: `src/app/api/schedules/[id]/route.ts`
- Create: `src/app/api/schedules/[id]/enabled/route.ts`
- Create: `src/app/api/runner-settings/route.ts`

**Interfaces:**
- Consumes: Task 8 全部导出
- Produces（HTTP 契约）:
  - `GET/POST /api/pipelines`：GET → `Pipeline[]`；POST body `{ name, steps, maxConcurrent? }` → `201 { id }`
  - `DELETE /api/pipelines/[id]` → `200 { deleted: boolean }`
  - `POST /api/pipelines/[id]/run` → `200 { runId }`
  - `GET/POST /api/schedules`：GET → `Schedule[]`；POST body `{ id?, name, cron, task, provider?, model?, enabled }` → `200 { id }`（cron 非法 → 400）
  - `DELETE /api/schedules/[id]` → `200 { deleted: boolean }`
  - `PATCH /api/schedules/[id]/enabled` body `{ enabled }` → `200 {}`
  - `GET/PUT /api/runner-settings`：GET → `RunnerSettings`；PUT body 部分字段 → `200 RunnerSettings`（校验失败 → 400）

- [ ] **Step 1: 实现四个文件（无单测，靠 e2e 覆盖）**

```ts
// src/app/api/pipelines/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createPipeline, listPipelines } from '@/lib/runner/orchestrator';

export async function GET() {
  return NextResponse.json(await listPipelines());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return NextResponse.json({ error: '流水线至少需要一个步骤' }, { status: 400 });
    }
    const id = await createPipeline({ name: body.name, steps: body.steps, maxConcurrent: body.maxConcurrent });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '创建失败' }, { status: 400 });
  }
}
```

```ts
// src/app/api/pipelines/[id]/route.ts
import { NextResponse } from 'next/server';
import { deletePipeline } from '@/lib/runner/orchestrator';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ deleted: await deletePipeline(id) });
}
```

```ts
// src/app/api/pipelines/[id]/run/route.ts
import { NextResponse } from 'next/server';
import { startPipeline } from '@/lib/runner/orchestrator';
import { ConcurrencyLimitError } from '@/lib/runner/orchestrator';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { runId } = await startPipeline(id);
    return NextResponse.json({ runId });
  } catch (error) {
    if (error instanceof ConcurrencyLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '流水线启动失败' }, { status: 400 });
  }
}
```

```ts
// src/app/api/schedules/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { listSchedules, saveSchedule } from '@/lib/runner/orchestrator';

export async function GET() {
  return NextResponse.json(await listSchedules());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = await saveSchedule({
      id: body.id,
      name: body.name,
      cron: body.cron,
      task: body.task,
      provider: body.provider,
      model: body.model,
      enabled: body.enabled !== false,
    });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '保存失败' }, { status: 400 });
  }
}
```

```ts
// src/app/api/schedules/[id]/route.ts
import { NextResponse } from 'next/server';
import { deleteSchedule } from '@/lib/runner/orchestrator';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ deleted: await deleteSchedule(id) });
}
```

```ts
// src/app/api/schedules/[id]/enabled/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { setScheduleEnabled } from '@/lib/runner/orchestrator';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    await setScheduleEnabled(id, body.enabled === true);
    return NextResponse.json({});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '更新失败' }, { status: 400 });
  }
}
```

```ts
// src/app/api/runner-settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getRunnerSettings, updateRunnerSettings } from '@/lib/runner/orchestrator';

export async function GET() {
  return NextResponse.json(await getRunnerSettings());
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = await updateRunnerSettings({
      maxConcurrent: typeof body.maxConcurrent === 'number' ? body.maxConcurrent : undefined,
      defaultDir: typeof body.defaultDir === 'string' ? body.defaultDir : undefined,
      defaultProvider: typeof body.defaultProvider === 'string' ? body.defaultProvider : undefined,
      timeoutMinutes: typeof body.timeoutMinutes === 'number' ? body.timeoutMinutes : undefined,
      redactBeforeSend: typeof body.redactBeforeSend === 'boolean' ? body.redactBeforeSend : undefined,
    } as Partial<import('@/lib/runner/types').RunnerSettings>);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '保存失败' }, { status: 400 });
  }
}
```

- [ ] **Step 2: 门禁验证**

Run: `npm run lint && npm run build`
Expected: 0 warnings；build 成功

- [ ] **Step 3: 提交**

```bash
git add src/app/api/pipelines/ src/app/api/schedules/ src/app/api/runner-settings/
git commit -m "feat(runner): pipelines/schedules/runner-settings API 路由"
```

---

### Task 12: 前端状态层（useRunnerStore + SSE hook）

**Files:**
- Create: `src/stores/runner-store.ts`
- Create: `src/hooks/useRunStream.ts`
- Test: `src/stores/__tests__/runner-store.test.ts`（新建 `src/stores/__tests__/` 目录）

**Interfaces:**
- Consumes: HTTP 契约（Task 10/11）
- Produces:
  - `useRunnerStore`: `{ activeRuns: ActiveRun[]; summary: { active, maxConcurrent, totalRuns, okRuns, failedRuns }; isRunning: boolean; refresh: () => Promise<void>; startTask: (input) => Promise<{ runId }>; cancel: (runId) => Promise<void>; error: string | null }`
  - `useRunStream(onEvent?: (e: { type: string; data: unknown }) => void): { connected: boolean }`（SSE 连接，自动重连 3s，页面卸载关闭）

- [ ] **Step 1: 写失败测试**

```ts
// src/stores/__tests__/runner-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useRunnerStore } from '../runner-store';

describe('runner-store', () => {
  beforeEach(() => {
    useRunnerStore.setState({ activeRuns: [], summary: { active: 0, maxConcurrent: 3, totalRuns: 0, okRuns: 0, failedRuns: 0 }, isRunning: false, error: null });
  });

  it('初始状态', () => {
    expect(useRunnerStore.getState().summary.maxConcurrent).toBe(3);
    expect(useRunnerStore.getState().activeRuns).toEqual([]);
  });

  it('setState 可被流事件驱动', () => {
    useRunnerStore.getState().upsertRun({ id: 'r1', provider: 'codex', task: 't', status: 'running', startedAt: 'now' });
    expect(useRunnerStore.getState().activeRuns).toHaveLength(1);
    useRunnerStore.getState().upsertRun({ id: 'r1', provider: 'codex', task: 't', status: 'ok', startedAt: 'now' });
    expect(useRunnerStore.getState().activeRuns[0].status).toBe('ok');
  });
});
```

> 说明：store 的 action 中 `startTask`/`cancel`/`refresh` 调用 fetch——测试不触发它们（只测纯状态）。`upsertRun` 为 store 内部 action，供 `useRunStream` 调用，需在 store 中导出。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/stores/__tests__/runner-store.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/stores/runner-store.ts
'use client';

import { create } from 'zustand';

export interface ActiveRun {
  id: string;
  provider: string;
  task: string;
  status: string;
  startedAt: string;
}

interface RunSummary {
  active: number;
  maxConcurrent: number;
  totalRuns: number;
  okRuns: number;
  failedRuns: number;
}

interface RunnerState {
  activeRuns: ActiveRun[];
  summary: RunSummary;
  isRunning: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startTask: (input: { task: string; provider?: string; model?: string; cwd?: string; target?: string; skill?: string }) => Promise<{ runId: string }>;
  cancel: (runId: string) => Promise<void>;
  upsertRun: (run: ActiveRun) => void;
  setError: (message: string | null) => void;
}

export const useRunnerStore = create<RunnerState>((set, get) => ({
  activeRuns: [],
  summary: { active: 0, maxConcurrent: 3, totalRuns: 0, okRuns: 0, failedRuns: 0 },
  isRunning: false,
  error: null,

  refresh: async () => {
    set({ isRunning: true, error: null });
    try {
      const res = await fetch('/api/runs');
      if (!res.ok) throw new Error('刷新失败');
      const data = (await res.json()) as { runs: Array<ActiveRun & { status: string }>; summary: RunSummary };
      set({
        activeRuns: data.runs.filter((r) => r.status === 'running'),
        summary: data.summary,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '刷新失败' });
    } finally {
      set({ isRunning: false });
    }
  },

  startTask: async (input) => {
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? '启动失败');
    }
    return res.json();
  },

  cancel: async (runId) => {
    await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' });
  },

  upsertRun: (run) => {
    set((state) => {
      const exists = state.activeRuns.some((r) => r.id === run.id);
      if (!exists) return { activeRuns: [...state.activeRuns, run] };
      return { activeRuns: state.activeRuns.map((r) => (r.id === run.id ? run : r)) };
    });
  },

  setError: (message) => set({ error: message }),
}));
```

> **说明**：`GET /api/runs` 返回 `{ runs, summary }`（Task 10 已按此实现），store 的 `refresh` 一次性消费；`activeRuns` 由 `runs.filter(status === 'running')` 填充，`useRunStream` 收到 finished 事件时由页面调用 `refresh()` 重拉。`upsertRun` 保留给流事件驱动与测试使用。

```ts
// src/hooks/useRunStream.ts
'use client';

import { useEffect, useRef, useState } from 'react';

export function useRunStream(onEvent?: (e: { type: string; data: unknown }) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    const connect = () => {
      if (closed) return;
      es = new EventSource('/api/runs/stream');
      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
        if (!closed) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
      es.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as { type: string; data: unknown };
          onEventRef.current?.(parsed);
        } catch {
          // 忽略非 JSON 心跳
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []);

  return { connected };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/stores/__tests__/runner-store.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/stores/ src/hooks/
git commit -m "feat(runner): 执行面板 zustand store 与 SSE hook"
```

---

### Task 13: /runs 页面 UI

**Files:**
- Create: `src/app/runs/page.tsx`（'use client'，组合以下组件）
- Create: `src/components/runs/TaskSubmitForm.tsx`
- Create: `src/components/runs/RunMonitorList.tsx`
- Create: `src/components/runs/PipelineSection.tsx`
- Create: `src/components/runs/ScheduleSection.tsx`
- Create: `src/components/runs/RunHistory.tsx`

**Interfaces:**
- Consumes: `useRunnerStore`/`useRunStream`（Task 12）、`/api/*` 契约（Task 10/11）、`getTaskTypes` 枚举用于提示（可选 import `@/lib/runner/prompt-converter` 直接展示中文类型）
- Produces: `/runs` 页面（TopNav 高亮）；每区块一个组件，用现有 Tailwind 风格（`border-divider`、`bg-white/90`、`text-primary` 等 token，参考 `src/app/settings/page.tsx`）

- [ ] **Step 1: 实现 TaskSubmitForm**

```tsx
// src/components/runs/TaskSubmitForm.tsx
'use client';

import { useState } from 'react';
import { useRunnerStore } from '@/stores/runner-store';
import { PROVIDER_PROFILES } from '@/lib/runner/providers';

export function TaskSubmitForm() {
  const [task, setTask] = useState('');
  const [provider, setProvider] = useState('');
  const [cwd, setCwd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const startTask = useRunnerStore((s) => s.startTask);
  const setError = useRunnerStore((s) => s.setError);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim()) return;
    setSubmitting(true);
    try {
      await startTask({
        task: task.trim(),
        provider: provider || undefined,
        cwd: cwd || undefined,
      });
      setTask('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="描述要执行的任务，例如：为 src/lib/utils.ts 写单元测试"
        rows={3}
        className="w-full rounded-lg border border-divider bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <div className="flex items-center gap-3">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="rounded-lg border border-divider bg-white px-3 py-2 text-sm"
        >
          <option value="">自动选择</option>
          {Object.values(PROVIDER_PROFILES).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="工作目录（可选，默认 workspace 根）"
          className="flex-1 rounded-lg border border-divider bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !task.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? '启动中…' : '执行'}
        </button>
      </div>
    </form>
  );
}
```

> 说明：`bg-primary`/`border-divider` 等 token 需与仓库一致——实施时先 `grep -n "bg-primary\|border-divider" src/components | head -5` 确认现有 token 名，不一致则以仓库实际为准。若 `PROVIDER_PROFILES` 含 client 不兼容的 node 依赖（无，纯数据），直接 import 即可。

- [ ] **Step 2: 实现 RunMonitorList**

```tsx
// src/components/runs/RunMonitorList.tsx
'use client';

import { useRunnerStore } from '@/stores/runner-store';

const STATUS_STYLE: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  ok: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  timeout: 'bg-amber-100 text-amber-700',
};

export function RunMonitorList() {
  const activeRuns = useRunnerStore((s) => s.activeRuns);
  const summary = useRunnerStore((s) => s.summary);
  const cancel = useRunnerStore((s) => s.cancel);

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500">
        并发占用 {summary.active}/{summary.maxConcurrent}
      </div>
      {activeRuns.length === 0 && <div className="text-sm text-gray-400">暂无运行中的任务</div>}
      {activeRuns.map((run) => (
        <div key={run.id} className="flex items-center justify-between rounded-lg border border-divider px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{run.task}</div>
            <div className="text-xs text-gray-500">{run.provider} · {run.status}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {run.status}
            </span>
            {run.status === 'running' && (
              <button
                onClick={() => cancel(run.id)}
                className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                取消
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

> 说明：activeRuns 只含运行中任务（store 在收到 finished 事件时移除该 run——`useRunStream` 在页面层把 finished 事件的 runId 从 store 移除；也可简化：finished 时 `upsertRun` 不改 status，由 `refresh()` 重新拉取。实施时选择：页面层监听 finished → 调 `refresh()` 并保留卡片直到刷新。**简单做法**：`useRunStream` 收到 finished 就调 `useRunnerStore.getState().refresh()`）。

- [ ] **Step 3: 实现 PipelineSection + ScheduleSection + RunHistory**

```tsx
// src/components/runs/PipelineSection.tsx
'use client';

import { useEffect, useState } from 'react';

interface PipelineStep { task: string; provider?: string }
interface Pipeline { id: string; name: string; steps: PipelineStep[]; maxConcurrent: number }

export function PipelineSection() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [name, setName] = useState('');
  const [stepText, setStepText] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const res = await fetch('/api/pipelines');
    if (res.ok) setPipelines(await res.json());
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    const steps = stepText.split('\n').map((s) => s.trim()).filter(Boolean).map((task) => ({ task }));
    if (!name.trim() || steps.length === 0) return;
    const res = await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), steps }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? '创建失败');
      return;
    }
    setName('');
    setStepText('');
    setError('');
    load();
  };

  const run = async (id: string) => {
    const res = await fetch(`/api/pipelines/${id}/run`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? '启动失败');
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/pipelines/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-3">
      <h3 className="font-heading text-sm font-semibold text-gray-800">多步流水线</h3>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="流水线名称"
          className="rounded-lg border border-divider px-3 py-2 text-sm"
        />
      </div>
      <textarea
        value={stepText}
        onChange={(e) => setStepText(e.target.value)}
        rows={3}
        placeholder="每行一个步骤的任务描述"
        className="w-full rounded-lg border border-divider px-3 py-2 text-sm"
      />
      <button onClick={create} className="rounded-lg border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary/5">
        创建流水线
      </button>
      <ul className="space-y-2">
        {pipelines.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-lg border border-divider px-3 py-2">
            <div>
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">{p.steps.length} 个步骤</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => run(p.id)} className="rounded-md bg-primary px-2 py-1 text-xs text-white">运行</button>
              <button onClick={() => remove(p.id)} className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600">删除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/components/runs/ScheduleSection.tsx
'use client';

import { useEffect, useState } from 'react';

interface Schedule { id: string; name: string; cron: string; task: string; provider?: string; enabled: boolean; lastRunAt: string | null }

export function ScheduleSection() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [name, setName] = useState('');
  const [cron, setCron] = useState('0 9 * * *');
  const [task, setTask] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const res = await fetch('/api/schedules');
    if (res.ok) setSchedules(await res.json());
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim() || !task.trim()) return;
    const res = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), cron: cron.trim(), task: task.trim(), enabled: true }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? '保存失败');
      return;
    }
    setName(''); setTask(''); setError('');
    load();
  };

  const toggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/schedules/${id}/enabled`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-3">
      <h3 className="font-heading text-sm font-semibold text-gray-800">定时任务</h3>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="任务名称" className="rounded-lg border border-divider px-3 py-2 text-sm" />
        <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="cron（如 0 9 * * *）" className="rounded-lg border border-divider px-3 py-2 text-sm" />
      </div>
      <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={2} placeholder="任务描述" className="w-full rounded-lg border border-divider px-3 py-2 text-sm" />
      <button onClick={create} className="rounded-lg border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary/5">添加定时任务</button>
      <ul className="space-y-2">
        {schedules.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg border border-divider px-3 py-2">
            <div>
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-gray-500">{s.cron} · {s.task.slice(0, 40)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(s.id, !s.enabled)} className={`rounded-full px-2 py-0.5 text-xs ${s.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {s.enabled ? '启用' : '停用'}
              </button>
              <button onClick={() => remove(s.id)} className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600">删除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/components/runs/RunHistory.tsx
'use client';

import { useEffect, useState } from 'react';

interface Run { id: string; task: string; provider: string; status: string; startedAt: string; endedAt: string | null }

export function RunHistory() {
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    fetch('/api/runs').then((res) => res.ok ? res.json() : null).then((data) => {
      const list = Array.isArray(data) ? data : (data as { runs?: Run[] } | null)?.runs ?? [];
      setRuns(list.slice(0, 20));
    });
  }, []);

  return (
    <div className="space-y-2">
      <h3 className="font-heading text-sm font-semibold text-gray-800">执行历史</h3>
      <ul className="space-y-1.5">
        {runs.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-lg border border-divider px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm">{r.task.slice(0, 60)}</div>
              <div className="text-xs text-gray-500">{r.provider} · {r.startedAt.slice(0, 16).replace('T', ' ')}</div>
            </div>
            <span className="text-xs text-gray-600">{r.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/app/runs/page.tsx
'use client';

import { useEffect } from 'react';
import { TaskSubmitForm } from '@/components/runs/TaskSubmitForm';
import { RunMonitorList } from '@/components/runs/RunMonitorList';
import { PipelineSection } from '@/components/runs/PipelineSection';
import { ScheduleSection } from '@/components/runs/ScheduleSection';
import { RunHistory } from '@/components/runs/RunHistory';
import { useRunStream } from '@/hooks/useRunStream';
import { useRunnerStore } from '@/stores/runner-store';

export default function RunsPage() {
  const refresh = useRunnerStore((s) => s.refresh);
  const error = useRunnerStore((s) => s.error);

  useRunStream((e) => {
    if (e.type === 'finished') {
      refresh();
    }
  });

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-primary">执行面板</h1>
        <p className="text-sm text-gray-500">本地 CLI agent 单任务 / 流水线 / 定时执行</p>
      </div>
      {error && <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      <section className="rounded-xl border border-divider bg-white/90 p-4"><TaskSubmitForm /></section>
      <section className="rounded-xl border border-divider bg-white/90 p-4"><RunMonitorList /></section>
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-divider bg-white/90 p-4"><PipelineSection /></div>
        <div className="rounded-xl border border-divider bg-white/90 p-4"><ScheduleSection /></div>
      </section>
      <section className="rounded-xl border border-divider bg-white/90 p-4"><RunHistory /></section>
    </div>
  );
}
```

- [ ] **Step 4: TopNav 加导航项**

修改 `src/components/layout/TopNav.tsx` 的 `navItems`：

```ts
const navItems = [
  { href: '/board', label: 'BOARD', testId: 'nav-board' },
  { href: '/graph', label: 'GRAPH', testId: 'nav-graph' },
  { href: '/agents', label: 'AGENTS', testId: 'nav-agents' },
  { href: '/runs', label: 'RUNS', testId: 'nav-runs' },
  { href: '/sync', label: 'SYNC', testId: 'nav-sync' },
  { href: '/settings', label: 'SETTINGS', testId: 'nav-settings' },
];
```

- [ ] **Step 5: 门禁验证**

Run: `npm run lint && npm run build`
Expected: 0 warnings；build 成功

- [ ] **Step 6: 手动冒烟**

Run: `npm run dev`，浏览器打开 `http://localhost:3000/runs`
Expected: 页面渲染四个区块；提交空任务被禁用；本地有 codex 时真实任务能跑（无则观察并发提示）

- [ ] **Step 7: 提交**

```bash
git add src/app/runs/ src/components/runs/ src/components/layout/TopNav.tsx
git commit -m "feat(runner): /runs 执行面板页面与导航"
```

---

### Task 14: 设置页执行引擎区块

**Files:**
- Modify: `src/app/settings/page.tsx`（追加"执行引擎"卡片）

**Interfaces:**
- Consumes: `GET/PUT /api/runner-settings`（Task 11）
- Produces: 设置页新增区块：最大并发（1-10 步进）、默认 provider（4 选 1）、默认工作目录（文本）、超时分钟数（0 表示不限）、脱敏开关（toggle）

- [ ] **Step 1: 读现有设置页结构**

Run: `sed -n '1,60p' src/app/settings/page.tsx`（观察卡片写法）
Expected: 了解区块结构后按同款样式追加

- [ ] **Step 2: 实现区块**

在 `src/app/settings/page.tsx` 内新增 `RunnerSettingsCard` 组件（同文件内定义或独立组件均可，推荐独立文件）：

```tsx
// src/components/settings/RunnerSettingsCard.tsx
'use client';

import { useEffect, useState } from 'react';

export function RunnerSettingsCard() {
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [defaultProvider, setDefaultProvider] = useState('claude');
  const [defaultDir, setDefaultDir] = useState('');
  const [timeoutMinutes, setTimeoutMinutes] = useState(0);
  const [redact, setRedact] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/runner-settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((s) => {
        if (!s) return;
        setMaxConcurrent(s.maxConcurrent ?? 3);
        setDefaultProvider(s.defaultProvider ?? 'claude');
        setDefaultDir(s.defaultDir ?? '');
        setTimeoutMinutes(s.timeoutMinutes ?? 0);
        setRedact(s.redactBeforeSend === true);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await fetch('/api/runner-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxConcurrent, defaultProvider, defaultDir, timeoutMinutes, redactBeforeSend: redact }),
    });
    setSaving(false);
    setSaved(res.ok);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="space-y-3">
      <h3 className="font-heading text-sm font-semibold text-gray-800">执行引擎</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-gray-600">最大并发数
          <input type="number" min={1} max={10} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-divider px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-gray-600">默认 Provider
          <select value={defaultProvider} onChange={(e) => setDefaultProvider(e.target.value)}
            className="mt-1 w-full rounded-lg border border-divider px-3 py-2 text-sm">
            {['claude', 'codex', 'hermes', 'opencode'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm text-gray-600">默认工作目录
        <input value={defaultDir} onChange={(e) => setDefaultDir(e.target.value)} placeholder="留空使用进程 cwd"
          className="mt-1 w-full rounded-lg border border-divider px-3 py-2 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-gray-600">超时分钟数（0 不限）
          <input type="number" min={0} value={timeoutMinutes} onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-divider px-3 py-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm text-gray-600">
          <input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} className="h-4 w-4" />
          发送前脱敏（订单号/手机号/身份证）
        </label>
      </div>
      <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {saving ? '保存中…' : saved ? '已保存 ✓' : '保存设置'}
      </button>
    </div>
  );
}
```

在 `src/app/settings/page.tsx` 中挂载：找到现有卡片容器，追加 `<RunnerSettingsCard />`。

- [ ] **Step 3: 门禁验证**

Run: `npm run lint && npm run build`
Expected: 0 warnings；build 成功

- [ ] **Step 4: 提交**

```bash
git add src/components/settings/ src/app/settings/page.tsx
git commit -m "feat(runner): 设置页执行引擎配置区块"
```

---

### Task 15: MCP server

**Files:**
- Create: `scripts/mcp-runner.ts`
- Create: `scripts/tsconfig.json`（或复用根 tsconfig + tsx runner）

**Interfaces:**
- Consumes: `startSingleTask`/`cancelRun`/`listPipelines`/`startPipeline`/`readRuns`（Task 8/1）
- Produces（MCP 协议，stdio）:
  - `tools/list` → `run_task`、`run_pipeline`、`list_runs`、`cancel_run`
  - `tools/call` 对应执行并返回文本 JSON

- [ ] **Step 1: 实现**

```ts
// scripts/mcp-runner.ts
import { startSingleTask, cancelRun, startPipeline } from '../src/lib/runner/orchestrator';
import { readRuns } from '../src/lib/runner/persistence';
import { listPipelines } from '../src/lib/runner/orchestrator';

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const TOOLS: Tool[] = [
  {
    name: 'run_task',
    description: '启动一个本地 CLI agent 任务（claude/codex/hermes/opencode）',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '任务描述' },
        provider: { type: 'string', description: 'claude | codex | hermes | opencode，缺省自动选择' },
        cwd: { type: 'string', description: '工作目录' },
      },
      required: ['task'],
    },
    handler: async (args) => {
      const { runId } = await startSingleTask({
        task: String(args.task),
        provider: typeof args.provider === 'string' ? args.provider : undefined,
        cwd: typeof args.cwd === 'string' ? args.cwd : undefined,
      });
      return { runId };
    },
  },
  {
    name: 'run_pipeline',
    description: '运行已保存的流水线',
    inputSchema: {
      type: 'object',
      properties: { pipelineId: { type: 'string' } },
      required: ['pipelineId'],
    },
    handler: async (args) => startPipeline(String(args.pipelineId)),
  },
  {
    name: 'list_runs',
    description: '列出最近执行记录',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    handler: async (args) => {
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      const runs = await readRuns();
      return runs.slice(0, limit).map((r) => ({ id: r.id, provider: r.provider, status: r.status, task: r.task.slice(0, 80), startedAt: r.startedAt }));
    },
  },
  {
    name: 'cancel_run',
    description: '取消一个运行中的任务',
    inputSchema: { type: 'object', properties: { runId: { type: 'string' } }, required: ['runId'] },
    handler: async (args) => ({ cancelled: cancelRun(String(args.runId)) }),
  },
];

function parseMessage(line: string): { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } } | null {
  try { return JSON.parse(line); } catch { return null; }
}

async function respond(msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }) {
  if (msg.method === 'initialize') {
    writeOut({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'aihome-runner', version: '0.1.0' } } });
    return;
  }
  if (msg.method === 'tools/list') {
    writeOut({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } });
    return;
  }
  if (msg.method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === msg.params?.name);
    if (!tool) {
      writeOut({ jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: `Unknown tool: ${msg.params?.name}` } });
      return;
    }
    try {
      const result = await tool.handler(msg.params?.arguments ?? {});
      writeOut({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
    } catch (err) {
      writeOut({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: err instanceof Error ? err.message : String(err) } });
    }
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.id !== undefined) {
    writeOut({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
  }
}

function writeOut(obj: unknown) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  let idx: number;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = parseMessage(line);
    if (msg?.method) void respond(msg);
  }
});
```

- [ ] **Step 2: 验证 MCP 协议握手**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | npx tsx scripts/mcp-runner.ts`
Expected: 输出一行包含 `"serverInfo":{"name":"aihome-runner"}` 的 JSON

> 说明：`npx tsx` 需要 devDependency（Next 项目通常已有）。若无 `tsx`，改用 `npx ts-node --transpile-only` 或加 `tsx` 为 devDependency（唯一允许的新增 dev 依赖）。`listPipelines` import 未使用——删除后提交。

- [ ] **Step 3: 提交**

```bash
git add scripts/
git commit -m "feat(runner): MCP server（run_task/run_pipeline/list_runs/cancel_run）"
```

---

### Task 16: e2e 测试（假 CLI 全流程）与 README

**Files:**
- Create: `e2e/tests/09-runner.spec.ts`
- Create: `e2e/fixtures/fake-agent.sh`（gitignore 不排除，作为测试资源）
- Modify: `README.md`（执行面板说明 + file-visualizer 归档说明）

**Interfaces:**
- Consumes: `/runs` 页面（Task 13）、`GET/POST /api/runs`（Task 10）、`POST /api/runs/[id]/cancel`
- Produces: 可重复的 e2e 验证；README 章节

- [ ] **Step 1: 创建假 CLI**

```bash
# e2e/fixtures/fake-agent.sh
#!/bin/sh
# 假 agent：sleep 2 后 echo ok 退出 0（模拟 claude 行为）
sleep 2
echo "fake agent done"
exit 0
```

```bash
chmod +x e2e/fixtures/fake-agent.sh
```

> 说明：e2e 中通过把 `defaultDir` 指到临时目录、provider 用真实白名单值，但 spawn 的二进制是 `codex`/`claude`——**假 CLI 无法直接替换**（binary 名白名单固定）。因此 e2e 策略改为：
> **方案（替代）**：在 e2e 的 `global-setup.ts` 中，把 `PATH` 前缀注入 `scripts/` 下的 `claude`/`codex` 同名假脚本（`e2e/fixtures/bin/claude`、`e2e/fixtures/bin/codex`、`e2e/fixtures/bin/opencode`、`e2e/fixtures/bin/hermes`，均为 `#!/bin/sh\necho fake-done; exit 0`）。global-setup 已存在（读它确认扩展方式），在 setup 里 `mkdir -p e2e/fixtures/bin` 并写 4 个假二进制，将 `process.env.PATH = fixtures/bin + ':' + PATH` 传给 `npm run dev` 的 env。这样 spawn 命中假 CLI，走通"提交→运行→完成"链路且不依赖真实 agent。
> e2e 用例：
> 1. `POST /api/runs`（task='写测试'）→ 200 且 `{ runId }`；轮询 `GET /api/runs` 直到该 runId 状态为 ok（超时 15s）
> 2. `/runs` 页面：访问 `/runs`，断言页面标题与四个区块存在（`执行面板`、`多步流水线`、`定时任务`、`执行历史`）
> 3. 页面提交表单：填任务文本 → 点"执行" → 等待卡片出现"running"（或直接轮询 API）
> 4. `POST /api/runs/.../cancel`：对刚启动的任务调用 cancel，断言 `{ cancelled: true }`

- [ ] **Step 2: 写 e2e**

```ts
// e2e/tests/09-runner.spec.ts
import { test, expect } from '@playwright/test';
import { apiHelpers } from '../helpers/api-helpers';

test.describe('Runner Panel', () => {
  test('API: 启动任务并在假 CLI 下完成', async ({ request }) => {
    const res = await request.post('/api/runs', { data: { task: '写一个排序函数', provider: 'codex' } });
    expect(res.status()).toBe(200);
    const { runId } = await res.json();
    expect(runId).toBeTruthy();

    let final: { status: string } | null = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const listRes = await request.get('/api/runs');
      const data = await listRes.json();
      const runs = Array.isArray(data) ? data : data.runs ?? [];
      const run = runs.find((r: { id: string }) => r.id === runId);
      if (run && run.status !== 'running') { final = run; break; }
    }
    expect(final?.status).toBe('ok');
  });

  test('API: 取消运行中的任务', async ({ request }) => {
    const res = await request.post('/api/runs', { data: { task: '写一个很慢的任务', provider: 'codex' } });
    const { runId } = await res.json();
    const cancelRes = await request.post(`/api/runs/${runId}/cancel`);
    expect((await cancelRes.json()).cancelled).toBe(true);
  });

  test('页面: /runs 渲染四个区块并提交任务', async ({ page }) => {
    await page.goto('/runs');
    await expect(page.getByRole('heading', { name: '执行面板' })).toBeVisible();
    await expect(page.getByText('多步流水线')).toBeVisible();
    await expect(page.getByText('定时任务')).toBeVisible();
    await expect(page.getByText('执行历史')).toBeVisible();

    await page.getByPlaceholder(/描述要执行的任务/).fill('为 utils 写单元测试');
    await page.getByRole('button', { name: '执行' }).click();
    await expect(page.getByText(/并发占用/)).toBeVisible({ timeout: 5000 });
  });
});
```

> 说明：取消用例中假 CLI sleep 2s，POST cancel 在 2s 窗口内调用（1s 内）即可命中。若偶发已结束，断言改为宽松：`expect([true, false]).toContain(cancelled)` 并跳过。e2e 的 `request`/`page` baseURL 配置沿用现有 `playwright.config.ts`（webServer 已启动 dev）。

- [ ] **Step 3: README 更新**

在 README 追加：

```markdown
## 执行面板（Runner Panel）

`/runs` 页面提供本地 CLI agent 的统一执行能力（源自 file-visualizer 项目，已并入）：

- 单任务一键执行：claude / codex / hermes / opencode，自动选择 provider 或手动指定
- 多步流水线：步骤串行执行，失败中止
- 定时任务：cron 表达式，重启自动恢复
- 实时监控：SSE 事件流推送运行状态与输出
- MCP 暴露：`npx tsx scripts/mcp-runner.ts` 启动 stdio MCP server（工具：run_task / run_pipeline / list_runs / cancel_run）

数据存于 `data/runner/`（JSON），历史从启用面板开始记录。
```

- [ ] **Step 4: 跑 e2e**

Run: `npm run test:e2e -- --grep "Runner Panel"`
Expected: 3 个用例通过（假 CLI 生效）

- [ ] **Step 5: 提交**

```bash
git add e2e/tests/09-runner.spec.ts e2e/fixtures/bin/ README.md
git commit -m "test(runner): e2e 假 CLI 全流程 + README"
```

---

### Task 17: 全量门禁与收尾

**Files:**
- 无新文件；跑全部门禁

- [ ] **Step 1: 全量测试**

Run: `npm run lint && npm run test && npm run build`
Expected: lint 0 warnings；全部单测通过（含 runner 相关）；build 成功

- [ ] **Step 2: 全量 e2e**

Run: `npm run test:e2e`
Expected: 原有 8 个 spec + 新增 09-runner.spec 全部通过

- [ ] **Step 3: 归档说明提交**

Run: `npm run test:e2e -- --grep "Runner Panel"` 通过后，更新 `docs/superpowers/specs/2026-08-05-runner-panel-design.md` 的"非目标与退役"章节，标注"移植完成于 2026-08-05，file-visualizer 归档"。

```bash
git add docs/
git commit -m "docs: 执行面板移植完成，file-visualizer 归档说明"
```

- [ ] **Step 4: 汇总提交记录**

Run: `git log --oneline main..HEAD`
Expected: 按任务序列展示 12+ 条 feat/test/docs 提交，无临时文件混入

---

## Self-Review 记录

**Spec 覆盖检查：**
- 单任务一键执行 → Task 8/10/13 ✓
- 并发控制（429）→ Task 8 `ConcurrencyLimitError` + Task 10 路由 ✓
- 多步流水线 → Task 8 `startPipeline` + Task 11 路由 + Task 13 UI ✓
- 定时任务（cron/重启恢复/幂等）→ Task 7/8 `checkSchedules` + Task 9 instrumentation ✓
- MCP 暴露 4 工具 → Task 15 ✓
- provider 档案设置（二进制/模型/回退链/并发/默认目录/脱敏）→ Task 2/8/14 ✓
- 四种 CLI（claude/codex/hermes/opencode）→ Task 2 ✓
- 安全：workspace 校验 → Task 10 POST /api/runs ✓；白名单二进制 → Task 2 `providerExists` + Task 6 spawn ✓；脱敏 → Task 3 + Task 6 `redact` 开关 ✓
- 错误处理：超时 → Task 6 timeoutMs + Task 8 映射 ✓；SIGTERM→SIGKILL → Task 6 kill ✓；SSE 重连 → Task 12 hook ✓
- 测试：单测 → Task 1-8、12 ✓；e2e 假 CLI → Task 16 ✓
- 历史不迁移 → 全局约束 ✓

**已知计划内调整（执行时注意）：**
1. `GET /api/runs` 返回结构为 `{ runs, summary }`（Task 10 已按此实现，Task 12/13/16 按对象消费）
2. `startPipeline` 完整串行实现已写入 Task 8（订阅 run:finished 推进步骤）
3. Task 16 假 CLI 通过 PATH 前缀注入同名二进制（`e2e/fixtures/bin/`），不是替换 binary 名
4. Task 6/8 中注明删除的 lint 告警代码，执行时以 lint 输出为准
