import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';

export function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function createSqlite(path: string, schema: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(schema);
  return db;
}

export function makeCcSwitchDb(p: string, rows: Array<Record<string, unknown>>): void {
  const db = new DatabaseSync(p);
  db.exec(
    `CREATE TABLE proxy_request_logs (
       request_id TEXT PRIMARY KEY, provider_id TEXT, app_type TEXT, model TEXT,
       input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
       cache_read_tokens INTEGER DEFAULT 0, cache_creation_tokens INTEGER DEFAULT 0,
       total_cost_usd TEXT DEFAULT '0', latency_ms INTEGER,
       session_id TEXT, status_code INTEGER, created_at INTEGER)`
  );
  const stmt = db.prepare(
    `INSERT INTO proxy_request_logs (request_id, provider_id, app_type, model,
       input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
       total_cost_usd, latency_ms, session_id, status_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    stmt.run(r.request_id, r.provider_id ?? 'p1', r.app_type, r.model, r.input_tokens ?? 0,
      r.output_tokens ?? 0, r.cache_read_tokens ?? 0, r.cache_creation_tokens ?? 0,
      r.total_cost_usd ?? '0', r.latency_ms ?? null, r.session_id ?? null,
      r.status_code ?? 200, r.created_at);
  }
  db.close();
}

export function rmTmp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
