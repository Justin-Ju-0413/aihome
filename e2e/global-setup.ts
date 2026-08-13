import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(__dirname, '..');
const syncRoot = path.join(root, 'e2e', '.e2e-sync');

export default function globalSetup(): void {
  fs.rmSync(syncRoot, { recursive: true, force: true });
  const alpha = path.join(syncRoot, 'alpha');
  const beta = path.join(syncRoot, 'beta');
  const repo = path.join(syncRoot, 'repo');
  const config = path.join(syncRoot, 'config');

  fs.mkdirSync(path.join(alpha, 'foo'), { recursive: true });
  fs.writeFileSync(path.join(alpha, 'foo', 'SKILL.md'), '---\ndescription: foo\n---\n\nv1\n');
  fs.mkdirSync(path.join(beta, 'foo'), { recursive: true });
  fs.writeFileSync(path.join(beta, 'foo', 'SKILL.md'), '---\ndescription: foo\n---\n\nv2-different\n');
  fs.mkdirSync(path.join(beta, 'bar'), { recursive: true });
  fs.writeFileSync(path.join(beta, 'bar', 'SKILL.md'), '---\ndescription: bar\n---\n\nunique\n');

  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(
    path.join(config, 'sync-config.json'),
    JSON.stringify({ version: 1, endpoints: { alpha, beta } }, null, 2)
  );
  // config.json：保证首页 redirect /board（无 config 时首页会跳 /onboarding）。
  // 11-onboarding.spec.ts 会自管删除/恢复此文件来测首用引导。
  // paths 指向真实 data（等价无 config 时的 DEFAULT），让不依赖 testData 的
  // API 契约测试扫到 sample-agents；groups 必须非空（validateWorkspaceConfig 要求）。
  fs.writeFileSync(
    path.join(config, 'config.json'),
    JSON.stringify(
      {
        name: 'AIHome',
        paths: [path.join(root, 'data')],
        groups: [
          { id: 'default', name: 'Default', color: '#6366f1', description: 'Default group' },
          { id: 'agents', name: 'Agents', color: '#10b981', description: 'Agent definitions' },
          { id: 'skills', name: 'Skills', color: '#f59e0b', description: 'Skill definitions' },
        ],
      },
      null,
      2
    )
  );
  fs.mkdirSync(repo, { recursive: true });

  fs.rmSync(path.join(root, 'e2e', '.e2e-workbench'), { recursive: true, force: true });

  const usageRoot = path.join(root, 'e2e', '.e2e-usage');
  fs.rmSync(usageRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(usageRoot, 'claude-projects', 'proj'), { recursive: true });
  fs.mkdirSync(path.join(usageRoot, 'codex-sessions', '2026', '08'), { recursive: true });
  // openclaw：空 agents 目录（模拟装了 OpenClaw 但无 agent 库，status 应为 ready 且 0 事件）
  fs.mkdirSync(path.join(usageRoot, 'openclaw-agents'), { recursive: true });

  const nowMs = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const safeMs = Math.max(nowMs - 3600_000, todayStart.getTime() + 5 * 60_000);
  const safeSec = Math.floor(safeMs / 1000);
  const ccDb = new DatabaseSync(path.join(usageRoot, 'cc-switch.db'));
  ccDb.exec(`CREATE TABLE proxy_request_logs (
    request_id TEXT PRIMARY KEY, provider_id TEXT, app_type TEXT, model TEXT,
    input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0, cache_creation_tokens INTEGER DEFAULT 0,
    total_cost_usd TEXT DEFAULT '0', latency_ms INTEGER, session_id TEXT,
    status_code INTEGER, created_at INTEGER)`);
  ccDb.prepare(`INSERT INTO proxy_request_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'r-ok', 'p1', 'opencode', 'deepseek-v4-flash', 100, 50, 0, 0, '0.01', 300, 's1', 200, safeSec);
  ccDb.prepare(`INSERT INTO proxy_request_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'r-fail', 'p1', 'opencode', 'deepseek-v4-flash', 1, 1, 0, 0, '0', 100, 's1', 500, safeSec - 60);
  // 未知模型：五层定价全部 miss，UI 应显示"未知定价"徽章
  ccDb.prepare(`INSERT INTO proxy_request_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'r-unknown', 'p1', 'opencode', 'x-unknown-model-9x', 10, 5, 0, 0, '0', 100, 's1', 200, safeSec - 120);
  ccDb.close();

  fs.writeFileSync(
    path.join(usageRoot, 'claude-projects', 'proj', 's1.jsonl'),
    JSON.stringify({
      type: 'assistant', uuid: 'u1', timestamp: new Date(safeMs).toISOString(),
      message: { model: 'glm-5.2', usage: { input_tokens: 500, output_tokens: 100,
        cache_read_input_tokens: 50, cache_creation_input_tokens: 10 } },
    }) + '\n'
  );

  fs.writeFileSync(
    path.join(usageRoot, 'codex-sessions', '2026', '08', 'rollout.jsonl'),
    JSON.stringify({ type: 'event_msg', payload: { model: 'gpt-5.5' } }) + '\n' +
    JSON.stringify({
      type: 'event_msg',
      timestamp: new Date(safeMs).toISOString(),
      payload: { type: 'token_count', info: { last_token_usage: {
        input_tokens: 800, cached_input_tokens: 100, output_tokens: 200 } } },
    }) + '\n'
  );

  const ocDb = new DatabaseSync(path.join(usageRoot, 'opencode.db'));
  ocDb.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, cost REAL NOT NULL DEFAULT 0,
    tokens_input INTEGER NOT NULL DEFAULT 0, tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_reasoning INTEGER NOT NULL DEFAULT 0, time_created INTEGER NOT NULL);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL, data TEXT NOT NULL)`);
  ocDb.prepare(`INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)`).run(
    's-oc', 0.25, 300, 150, 0, safeMs);
  ocDb.prepare(`INSERT INTO message VALUES (?, ?, ?, ?)`).run(
    'm-oc', 's-oc', safeMs, JSON.stringify({ model: { modelID: 'deepseek-v4-flash' } }));
  ocDb.close();

  const hDb = new DatabaseSync(path.join(usageRoot, 'hermes.db'));
  hDb.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, model TEXT, started_at REAL,
    input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL, actual_cost_usd REAL)`);
  hDb.prepare(`INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'h-1', 'cli', 'qwen3.5-9b', safeSec, 200, 80, 5, 2, 0, 0.05);
  hDb.close();
}
