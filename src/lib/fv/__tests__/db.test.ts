import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { getDb, resetDbForTests, stmts } from '../db';

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-db-test-'));

beforeEach(() => {
  resetDbForTests();
  process.env.AIHOME_FV_DB = path.join(DB_DIR, 'test.db');
  // 防止自动迁移把真实的 file-visualizer/data.db 带进测试库
  process.env.AIHOME_FV_LEGACY_DB = path.join(DB_DIR, 'no-legacy.db');
});

afterEach(() => {
  resetDbForTests();
  delete process.env.AIHOME_FV_DB;
  delete process.env.AIHOME_FV_LEGACY_DB;
});

describe('fv db', () => {
  it('creates all tables and supports agent roundtrip', () => {
    const db = getDb();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r: Record<string, unknown>) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'agents', 'agent_steps', 'agent_logs', 'history', 'file_watch',
        'pipelines', 'agent_templates', 'settings', 'snapshots', 'diffs',
      ])
    );

    stmts.insertAgent({
      id: 'a1', name: 'test', provider: 'claude', status: 'pending', description: 'desc',
      target: '', cwd: '/tmp', prompt: 'do it', totalSteps: 2,
      pipelineId: null, pipelineOrder: 0, nextAgentId: null,
    });
    stmts.insertStep({ agentId: 'a1', stepNum: 1, name: 'read', status: 'pending' });
    stmts.insertStep({ agentId: 'a1', stepNum: 2, name: 'write', status: 'pending' });
    stmts.insertLog({ agentId: 'a1', type: 'stdout', content: 'hello', structured: '{}' });

    const agent = stmts.getAgent('a1');
    expect(agent?.name).toBe('test');
    expect(stmts.getSteps('a1')).toHaveLength(2);
    expect(stmts.getLogs('a1')[0]?.content).toBe('hello');

    stmts.updateAgentStatus({ id: 'a1', status: 'running', progress: 50, currentStep: 1, finishedAt: null, tokenUsage: 10 });
    expect(stmts.getAgent('a1')?.status).toBe('running');
    expect(stmts.listActiveAgents()).toHaveLength(1);
  });

  it('migrates legacy db via VACUUM INTO', () => {
    // 构造一个旧版 data.db（含 WAL 数据），放到 legacy 路径
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-legacy-'));
    const legacyPath = path.join(legacyDir, 'data.db');
    process.env.AIHOME_FV_LEGACY_DB = legacyPath;

    const legacy = new DatabaseSync(legacyPath);
    legacy.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, provider TEXT, status TEXT)`);
    legacy.exec(`INSERT INTO agents VALUES ('legacy-1', 'old agent', 'claude', 'completed')`);
    legacy.close();

    // 新库路径尚未存在 → getDb 触发迁移
    const newPath = path.join(DB_DIR, 'migrated.db');
    process.env.AIHOME_FV_DB = newPath;
    const db = getDb();

    const rows = db.prepare(`SELECT * FROM agents`).all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('old agent');

    delete process.env.AIHOME_FV_LEGACY_DB;
  });

  it('migrates nothing when legacy db is missing', () => {
    process.env.AIHOME_FV_LEGACY_DB = path.join(DB_DIR, 'definitely-missing-legacy.db');
    const newPath = path.join(DB_DIR, 'fresh.db');
    process.env.AIHOME_FV_DB = newPath;
    getDb();
    expect(fs.existsSync(newPath)).toBe(true);
    const db = getDb();
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM agents`).all() as Array<{ n: number }>;
    expect(Number(rows[0].n)).toBe(0);
  });

  it('keeps settings, history and file_watch working', () => {
    stmts.upsertSetting({ key: 'k1', value: 'v1', category: 'cat' });
    stmts.upsertSetting({ key: 'k1', value: 'v2', category: 'cat' });
    expect(stmts.getSetting('k1')?.value).toBe('v2');

    stmts.insertHistory({ type: 'agent', title: 't', description: 'd', agentId: 'a1', filePath: '/x' });
    expect(stmts.listHistory(10)).toHaveLength(1);
    expect(stmts.listHistoryByType('agent', 10)).toHaveLength(1);

    stmts.upsertFileWatch({ path: '/a.txt', agentIds: '[]' });
    stmts.upsertFileWatch({ path: '/a.txt', agentIds: '["a1"]' });
    const w = stmts.getFileWatch('/a.txt');
    expect(w?.ops_count).toBe(2);
    expect(w?.agent_ids).toBe('["a1"]');
  });

  it('supports snapshots and diffs', () => {
    stmts.insertSnapshot({ agentId: 'a1', filePath: '/f.txt', contentHash: 'h1', content: 'old' });
    const snap = stmts.getLatestSnapshot('/f.txt');
    expect(snap?.content_hash).toBe('h1');

    stmts.insertDiff({ agentId: 'a1', filePath: '/f.txt', diffContent: '-old\n+new', snapshotId: Number(snap?.id) });
    expect(stmts.getDiffsByAgent('a1')).toHaveLength(1);
    expect(stmts.getDiffsByFile('/f.txt')).toHaveLength(1);
  });

  it('supports pipelines and templates', () => {
    stmts.insertPipeline({ id: 'p1', name: 'pipe', description: '', status: 'pending', agentIds: '["a1"]' });
    stmts.insertAgent({
      id: 'a2', name: 'tpl', provider: 'codex', status: 'pending', description: '', target: '',
      cwd: '/', prompt: '', totalSteps: 0, pipelineId: 'p1', pipelineOrder: 0, nextAgentId: null,
    });
    stmts.updateAgentNext({ id: 'a2', nextAgentId: null });
    stmts.insertTemplate({ id: 't1', name: 'tpl', provider: 'claude', description: '', prompt: 'x {{y}}', steps: '["a"]', variables: '["y"]', category: 'general' });

    expect(stmts.getPipeline('p1')?.status).toBe('pending');
    const tpl = stmts.getTemplate('t1');
    expect(tpl?.prompt).toBe('x {{y}}');
    expect(stmts.listTemplatesByCategory('general')).toHaveLength(1);
    stmts.deleteTemplate('t1');
    expect(stmts.getTemplate('t1')).toBeUndefined();
  });
});
