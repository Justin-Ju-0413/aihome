// src/lib/runner/__tests__/persistence.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { setRunnerDataDir } from '../persistence';
import { readRuns, appendRun, readPipelines, savePipelines, readSchedules, saveSchedules, readSettings } from '../persistence';
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
    // readRuns 返回倒序（新在前）：最新一行（status 'ok'）应在 runs[0]
    expect(runs[0].status).toBe('ok');
    expect(runs[1].status).toBe('running');
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
