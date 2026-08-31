import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { resetDbForTests } from '../db';
import { GET as eventsGET } from '@/app/api/fv/events/route';
import { GET as treeGET } from '@/app/api/fv/tree/route';
import { GET as statsGET } from '@/app/api/fv/stats/route';
import { GET as agentsGET, POST as agentsPOST } from '@/app/api/fv/agents/route';
import { POST as runExplainPOST } from '@/app/api/fv/run/explain/route';
import { POST as runCompositePOST } from '@/app/api/fv/run/composite/route';
import { PUT as settingsPUT, GET as settingsGET } from '@/app/api/fv/settings/[key]/route';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-api-test-'));
const DB_PATH = path.join(TMP, 'api.db');
const TREE_DIR = path.join(TMP, 'tree');
beforeAllSetup();

function beforeAllSetup(): void {
  fs.mkdirSync(TREE_DIR, { recursive: true });
  fs.writeFileSync(path.join(TREE_DIR, 'a.txt'), 'hello');
  fs.mkdirSync(path.join(TREE_DIR, 'sub'));
  fs.writeFileSync(path.join(TREE_DIR, 'sub', 'b.ts'), 'const x = 1;');
}

beforeEach(() => {
  resetDbForTests();
  process.env.AIHOME_FV_DB = DB_PATH;
  process.env.AIHOME_FV_LEGACY_DB = path.join(TMP, 'no-legacy.db');
  // 清掉全局 init guard，让每个测试重新走 ensureFvInit
  delete (globalThis as Record<string, unknown>)['__fvInitDone__'];
});

afterEach(() => {
  resetDbForTests();
  delete process.env.AIHOME_FV_DB;
  delete process.env.AIHOME_FV_LEGACY_DB;
  delete (globalThis as Record<string, unknown>)['__fvInitDone__'];
});

describe('fv api routes', () => {
  it('GET /api/fv/events returns incremental events by cursor', async () => {
    const res1 = await eventsGET(new NextRequest('http://localhost/api/fv/events'));
    const body1 = await res1.json();
    expect(Array.isArray(body1.events)).toBe(true);
    expect(typeof body1.cursor).toBe('number');

    const res2 = await eventsGET(new NextRequest(`http://localhost/api/fv/events?cursor=${body1.cursor}`));
    const body2 = await res2.json();
    expect(body2.events).toHaveLength(0);
    expect(body2.cursor).toBe(body1.cursor);
  });

  it('GET /api/fv/tree scans directory with folders first', async () => {
    const res = await treeGET(new NextRequest(`http://localhost/api/fv/tree?dir=${TREE_DIR}`));
    const body = await res.json();
    expect(body.root).toBe(TREE_DIR);
    const names = body.tree.map((n: { name: string }) => n.name);
    expect(names).toEqual(['sub', 'a.txt']); // 目录优先 + localeCompare
  });

  it('GET /api/fv/stats returns zeroed stats on empty db', async () => {
    const res = await statsGET();
    const body = await res.json();
    expect(body.totalAgents).toBe(0);
    expect(body.successRate).toBe('0%');
  });

  it('POST /api/fv/agents creates agent and rejects bad provider', async () => {
    const bad = await agentsPOST(
      new NextRequest('http://localhost/api/fv/agents', {
        method: 'POST',
        body: JSON.stringify({ name: 'x', provider: 'nope' }),
      })
    );
    expect(bad.status).toBe(400);

    const good = await agentsPOST(
      new NextRequest('http://localhost/api/fv/agents', {
        method: 'POST',
        body: JSON.stringify({ name: '测试agent', provider: 'claude', prompt: 'do it', steps: ['a', 'b'] }),
      })
    );
    expect(good.status).toBe(200);
    const created = await good.json();
    expect(created.id).toBeTruthy();

    const list = await agentsGET();
    const agents = await list.json();
    expect(agents).toHaveLength(1);
    expect(agents[0].steps).toHaveLength(2);
  });

  it('POST /api/fv/agents accepts zcode and dsh providers', async () => {
    for (const provider of ['zcode', 'dsh']) {
      const res = await agentsPOST(
        new NextRequest('http://localhost/api/fv/agents', {
          method: 'POST',
          body: JSON.stringify({ name: `agent-${provider}`, provider, prompt: 'do it' }),
        })
      );
      expect(res.status).toBe(200);
    }
  });

  it('POST /api/fv/run/explain returns schedule explanation', async () => {
    const res = await runExplainPOST(
      new NextRequest('http://localhost/api/fv/run/explain', {
        method: 'POST',
        body: JSON.stringify({ task: '写一个排序函数' }),
      })
    );
    const body = await res.json();
    expect(body.taskType).toBe('code_generation');
    expect(Array.isArray(body.fallbackChain)).toBe(true);
    expect(Array.isArray(body.reasons)).toBe(true);
  });

  it('POST /api/fv/run/composite splits composite tasks', async () => {
    const res = await runCompositePOST(
      new NextRequest('http://localhost/api/fv/run/composite', {
        method: 'POST',
        body: JSON.stringify({ task: '先写代码，然后补充文档' }),
      })
    );
    const body = await res.json();
    expect(body.composite).toBe(true);
    expect(body.parts).toHaveLength(2);
    expect(body.parts[0].provider).toBeTruthy();
  });

  it('PUT /api/fv/settings/:key validates and persists', async () => {
    const invalid = await settingsPUT(new NextRequest('http://localhost/api/fv/settings/agent.max_concurrent', {
      method: 'PUT',
      body: JSON.stringify({ value: '99' }),
    }), { params: Promise.resolve({ key: 'agent.max_concurrent' }) });
    expect(invalid.status).toBe(400);

    const ok = await settingsPUT(new NextRequest('http://localhost/api/fv/settings/agent.max_concurrent', {
      method: 'PUT',
      body: JSON.stringify({ value: '5' }),
    }), { params: Promise.resolve({ key: 'agent.max_concurrent' }) });
    expect(ok.status).toBe(200);

    const got = await settingsGET(new NextRequest('http://localhost/api/fv/settings/agent.max_concurrent'), {
      params: Promise.resolve({ key: 'agent.max_concurrent' }),
    });
    const body = await got.json();
    expect(body.value).toBe('5');
  });
});
