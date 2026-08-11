import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { fvDbPath, legacyFvDbPath } from './paths';

/** FileVision 运行时库的全部表结构（与 Express 版 data.db 一致） */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT DEFAULT '',
  target TEXT DEFAULT '',
  cwd TEXT DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  progress REAL DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  current_step INTEGER DEFAULT 0,
  pipeline_id TEXT,
  pipeline_order INTEGER DEFAULT 0,
  next_agent_id TEXT,
  token_usage INTEGER DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS agent_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  step_num INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
CREATE TABLE IF NOT EXISTS agent_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  structured TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  agent_id TEXT,
  file_path TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS file_watch (
  path TEXT PRIMARY KEY,
  agent_ids TEXT DEFAULT '[]',
  last_modified TEXT,
  ops_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  agent_ids TEXT DEFAULT '[]',
  current_index INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS agent_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  description TEXT DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  steps TEXT DEFAULT '[]',
  variables TEXT DEFAULT '[]',
  category TEXT DEFAULT 'general',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS diffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  diff_content TEXT NOT NULL,
  snapshot_id INTEGER REFERENCES snapshots(id),
  created_at TEXT DEFAULT (datetime('now'))
);
`;

/** 首次运行时若新库不存在且旧 data.db 存在，用 VACUUM INTO 整体迁移（含 WAL 数据） */
function maybeMigrate(dbPath: string): void {
  if (fs.existsSync(dbPath)) return;
  const legacy = legacyFvDbPath();
  if (!fs.existsSync(legacy)) return;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const src = new DatabaseSync(legacy, { readOnly: true });
    try {
      src.exec(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`);
      console.log(`[fv] migrated legacy data.db -> ${dbPath}`);
    } finally {
      src.close();
    }
  } catch (err) {
    console.error('[fv] legacy migration failed:', err);
  }
}

let db: DatabaseSync | null = null;

export function getDb(dbPath = fvDbPath()): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  maybeMigrate(dbPath);
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

export type Row = Record<string, unknown>;

/** 仅测试使用：关闭并清空模块级单例，使下次 getDb 按新的 env 路径重开 */
export function resetDbForTests(): void {
  if (db) {
    try {
      db.close();
    } catch {
      // 忽略关闭异常
    }
    db = null;
  }
}

export const stmts = {
  // --- AGENTS ---
  insertAgent: (p: {
    id: string; name: string; provider: string; status: string; description: string;
    target: string; cwd: string; prompt: string; totalSteps: number;
    pipelineId: string | null; pipelineOrder: number; nextAgentId: string | null;
  }): void => {
    getDb().prepare(
      `INSERT INTO agents (id, name, provider, status, description, target, cwd, prompt, total_steps, pipeline_id, pipeline_order, next_agent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(p.id, p.name, p.provider, p.status, p.description, p.target, p.cwd, p.prompt,
      p.totalSteps, p.pipelineId, p.pipelineOrder, p.nextAgentId);
  },
  updateAgentStatus: (p: {
    id: string; status: string; progress: number; currentStep: number;
    finishedAt: string | null; tokenUsage: number;
  }): void => {
    getDb().prepare(
      `UPDATE agents SET status = ?, progress = ?, current_step = ?, finished_at = ?, token_usage = ? WHERE id = ?`
    ).run(p.status, p.progress, p.currentStep, p.finishedAt, p.tokenUsage, p.id);
  },
  updateAgentNext: (p: { id: string; nextAgentId: string | null }): void => {
    getDb().prepare(`UPDATE agents SET next_agent_id = ? WHERE id = ?`).run(p.nextAgentId, p.id);
  },
  getAgent: (id: string): Row | undefined =>
    getDb().prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as Row | undefined,
  listAgents: (): Row[] =>
    getDb().prepare(`SELECT * FROM agents ORDER BY created_at DESC`).all() as Row[],
  listActiveAgents: (): Row[] =>
    getDb().prepare(`SELECT * FROM agents WHERE status IN ('running', 'pending') ORDER BY created_at DESC`).all() as Row[],
  listAgentsByPipeline: (pipelineId: string): Row[] =>
    getDb().prepare(`SELECT * FROM agents WHERE pipeline_id = ? ORDER BY pipeline_order`).all(pipelineId) as Row[],

  // --- STEPS ---
  insertStep: (p: { agentId: string; stepNum: number; name: string; status: string }): void => {
    getDb().prepare(`INSERT INTO agent_steps (agent_id, step_num, name, status) VALUES (?, ?, ?, ?)`)
      .run(p.agentId, p.stepNum, p.name, p.status);
  },
  updateStep: (p: { agentId: string; stepNum: number; status: string }): void => {
    getDb().prepare(`UPDATE agent_steps SET status = ? WHERE agent_id = ? AND step_num = ?`)
      .run(p.status, p.agentId, p.stepNum);
  },
  getSteps: (agentId: string): Row[] =>
    getDb().prepare(`SELECT * FROM agent_steps WHERE agent_id = ? ORDER BY step_num`).all(agentId) as Row[],

  // --- LOGS ---
  insertLog: (p: { agentId: string; type: string; content: string; structured: string }): void => {
    getDb().prepare(`INSERT INTO agent_logs (agent_id, type, content, structured) VALUES (?, ?, ?, ?)`)
      .run(p.agentId, p.type, p.content, p.structured);
  },
  getLogs: (agentId: string): Row[] =>
    getDb().prepare(`SELECT * FROM agent_logs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 200`).all(agentId) as Row[],

  // --- HISTORY ---
  insertHistory: (p: { type: string; title: string; description: string; agentId: string | null; filePath: string }): void => {
    getDb().prepare(`INSERT INTO history (type, title, description, agent_id, file_path) VALUES (?, ?, ?, ?, ?)`)
      .run(p.type, p.title, p.description, p.agentId, p.filePath);
  },
  listHistory: (limit: number): Row[] =>
    getDb().prepare(`SELECT * FROM history ORDER BY created_at DESC LIMIT ?`).all(limit) as Row[],
  listHistoryByType: (type: string, limit: number): Row[] =>
    getDb().prepare(`SELECT * FROM history WHERE type = ? ORDER BY created_at DESC LIMIT ?`).all(type, limit) as Row[],

  // --- FILE WATCH ---
  upsertFileWatch: (p: { path: string; agentIds: string }): void => {
    getDb().prepare(
      `INSERT INTO file_watch (path, agent_ids, ops_count) VALUES (?, ?, 1)
       ON CONFLICT(path) DO UPDATE SET agent_ids = excluded.agent_ids, ops_count = ops_count + 1, last_modified = datetime('now')`
    ).run(p.path, p.agentIds);
  },
  getFileWatch: (filePath: string): Row | undefined =>
    getDb().prepare(`SELECT * FROM file_watch WHERE path = ?`).get(filePath) as Row | undefined,
  listFileWatch: (): Row[] =>
    getDb().prepare(`SELECT * FROM file_watch`).all() as Row[],

  // --- PIPELINES ---
  insertPipeline: (p: { id: string; name: string; description: string; status: string; agentIds: string }): void => {
    getDb().prepare(`INSERT INTO pipelines (id, name, description, status, agent_ids) VALUES (?, ?, ?, ?, ?)`)
      .run(p.id, p.name, p.description, p.status, p.agentIds);
  },
  updatePipelineStatus: (p: { id: string; status: string; currentIndex: number; finishedAt: string | null }): void => {
    getDb().prepare(`UPDATE pipelines SET status = ?, current_index = ?, finished_at = ? WHERE id = ?`)
      .run(p.status, p.currentIndex, p.finishedAt, p.id);
  },
  getPipeline: (id: string): Row | undefined =>
    getDb().prepare(`SELECT * FROM pipelines WHERE id = ?`).get(id) as Row | undefined,
  listPipelines: (): Row[] =>
    getDb().prepare(`SELECT * FROM pipelines ORDER BY created_at DESC`).all() as Row[],

  // --- TEMPLATES ---
  insertTemplate: (p: { id: string; name: string; provider: string; description: string; prompt: string; steps: string; variables: string; category: string }): void => {
    getDb().prepare(`INSERT INTO agent_templates (id, name, provider, description, prompt, steps, variables, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(p.id, p.name, p.provider, p.description, p.prompt, p.steps, p.variables, p.category);
  },
  getTemplate: (id: string): Row | undefined =>
    getDb().prepare(`SELECT * FROM agent_templates WHERE id = ?`).get(id) as Row | undefined,
  listTemplates: (): Row[] =>
    getDb().prepare(`SELECT * FROM agent_templates ORDER BY category, name`).all() as Row[],
  listTemplatesByCategory: (category: string): Row[] =>
    getDb().prepare(`SELECT * FROM agent_templates WHERE category = ? ORDER BY name`).all(category) as Row[],
  deleteTemplate: (id: string): void => {
    getDb().prepare(`DELETE FROM agent_templates WHERE id = ?`).run(id);
  },

  // --- SNAPSHOTS ---
  insertSnapshot: (p: { agentId: string; filePath: string; contentHash: string; content: string }): void => {
    getDb().prepare(`INSERT INTO snapshots (agent_id, file_path, content_hash, content) VALUES (?, ?, ?, ?)`)
      .run(p.agentId, p.filePath, p.contentHash, p.content);
  },
  getSnapshotsByAgent: (agentId: string): Row[] =>
    getDb().prepare(`SELECT * FROM snapshots WHERE agent_id = ? ORDER BY created_at DESC`).all(agentId) as Row[],
  getLatestSnapshot: (filePath: string): Row | undefined =>
    getDb().prepare(`SELECT * FROM snapshots WHERE file_path = ? ORDER BY created_at DESC LIMIT 1`).get(filePath) as Row | undefined,

  // --- DIFFS ---
  insertDiff: (p: { agentId: string; filePath: string; diffContent: string; snapshotId: number }): void => {
    getDb().prepare(`INSERT INTO diffs (agent_id, file_path, diff_content, snapshot_id) VALUES (?, ?, ?, ?)`)
      .run(p.agentId, p.filePath, p.diffContent, p.snapshotId);
  },
  getDiffsByAgent: (agentId: string): Row[] =>
    getDb().prepare(`SELECT * FROM diffs WHERE agent_id = ? ORDER BY created_at DESC`).all(agentId) as Row[],
  getDiffsByFile: (filePath: string): Row[] =>
    getDb().prepare(`SELECT * FROM diffs WHERE file_path = ? ORDER BY created_at DESC LIMIT 20`).all(filePath) as Row[],

  // --- SETTINGS ---
  upsertSetting: (p: { key: string; value: string; category: string }): void => {
    getDb().prepare(
      `INSERT INTO settings (key, value, category, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category, updated_at = datetime('now')`
    ).run(p.key, p.value, p.category);
  },
  getSetting: (key: string): Row | undefined =>
    getDb().prepare(`SELECT * FROM settings WHERE key = ?`).get(key) as Row | undefined,
  listSettings: (): Row[] =>
    getDb().prepare(`SELECT * FROM settings ORDER BY category, key`).all() as Row[],
  listSettingsByCategory: (category: string): Row[] =>
    getDb().prepare(`SELECT * FROM settings WHERE category = ? ORDER BY key`).all(category) as Row[],
  deleteSetting: (key: string): void => {
    getDb().prepare(`DELETE FROM settings WHERE key = ?`).run(key);
  },
};
