import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { ActiveUsageSource, Checkpoint, ScannedEvent } from './types';
import type { PricingSource } from './pricing';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  raw_id TEXT NOT NULL,
  source TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER,
  session_id TEXT,
  pricing_source TEXT,
  ts INTEGER NOT NULL,
  PRIMARY KEY (source, raw_id)
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(source, ts);
CREATE TABLE IF NOT EXISTS checkpoints (
  source TEXT PRIMARY KEY,
  ts INTEGER NOT NULL DEFAULT 0,
  mtime INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function migrateSchema(db: DatabaseSync): void {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (user_version >= 2) return;
  const cols = db.prepare('PRAGMA table_info(events)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'pricing_source')) {
    db.exec('ALTER TABLE events ADD COLUMN pricing_source TEXT');
  }
  db.exec('PRAGMA user_version = 2');
}

export class UsageCache {
  private constructor(private db: DatabaseSync) {}

  static open(cachePath: string): UsageCache {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const db = new DatabaseSync(cachePath);
    db.exec(SCHEMA);
    migrateSchema(db);
    return new UsageCache(db);
  }

  insertEvents(events: ScannedEvent[]): number {
    if (events.length === 0) return 0;
    const stmt = this.db.prepare(
      `INSERT INTO events (raw_id, source, provider, model, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, session_id, ts, pricing_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source, raw_id) DO NOTHING`
    );
    let inserted = 0;
    this.db.exec('BEGIN');
    try {
      for (const e of events) {
        const r = stmt.run(e.rawId, e.source, e.provider, e.model, e.inputTokens, e.outputTokens,
          e.cacheReadTokens, e.cacheWriteTokens, e.costUsd,
          e.latencyMs ?? null, e.sessionId ?? null, e.timestamp, e.pricingSource ?? null);
        inserted += Number(r.changes);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return inserted;
  }

  getCheckpoint(source: ActiveUsageSource): Checkpoint {
    const row = this.db
      .prepare('SELECT ts, mtime FROM checkpoints WHERE source = ?')
      .get(source) as { ts: number; mtime: number } | undefined;
    return row ? { ts: row.ts, mtime: row.mtime } : { ts: 0, mtime: 0 };
  }

  setCheckpoint(source: ActiveUsageSource, cp: Checkpoint): void {
    this.db
      .prepare('INSERT OR REPLACE INTO checkpoints (source, ts, mtime) VALUES (?, ?, ?)')
      .run(source, cp.ts, cp.mtime);
  }

  queryEvents(sources: ActiveUsageSource[], sinceMs: number): ScannedEvent[] {
    if (sources.length === 0) return [];
    const placeholders = sources.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT raw_id, source, provider, model, input_tokens, output_tokens,
                cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, session_id, ts, pricing_source
         FROM events WHERE source IN (${placeholders}) AND ts >= ?
         ORDER BY ts`
      )
      .all(...sources, sinceMs) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      rawId: String(r.raw_id),
      source: r.source as ActiveUsageSource,
      provider: String(r.provider),
      model: String(r.model),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      cacheReadTokens: Number(r.cache_read_tokens),
      cacheWriteTokens: Number(r.cache_write_tokens),
      costUsd: Number(r.cost_usd),
      latencyMs: r.latency_ms == null ? undefined : Number(r.latency_ms),
      sessionId: r.session_id == null ? undefined : String(r.session_id),
      timestamp: Number(r.ts),
      pricingSource: r.pricing_source == null ? undefined : (r.pricing_source as PricingSource),
    }));
  }

  backfillPricingSource(resolve: (model: string) => PricingSource | null): number {
    const rows = this.db
      .prepare(`SELECT DISTINCT model FROM events WHERE pricing_source IS NULL AND source IN ('claude','codex')`)
      .all() as Array<{ model: string }>;
    const update = this.db.prepare(
      `UPDATE events SET pricing_source = ? WHERE model = ? AND pricing_source IS NULL AND source IN ('claude','codex')`
    );
    let n = 0;
    for (const { model } of rows) {
      const src = resolve(model);
      if (!src) continue;
      n += Number(update.run(src, model).changes);
    }
    return n;
  }

  countEvents(source: ActiveUsageSource): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM events WHERE source = ?')
      .get(source) as { n: number };
    return Number(row.n);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
  }

  close(): void {
    this.db.close();
  }
}
