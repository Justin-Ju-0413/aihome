import { existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import type { Checkpoint, ScannedEvent } from '../types';

export function scanHermes(
  dbPath: string,
  cp: Checkpoint
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  if (!existsSync(dbPath)) return { events: [], checkpoint: cp };
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT id, source, model, started_at, input_tokens, output_tokens,
                cache_read_tokens, cache_write_tokens, estimated_cost_usd, actual_cost_usd
         FROM sessions WHERE started_at >= ? ORDER BY started_at`
      )
      .all(cp.ts) as Array<Record<string, unknown>>;
    const events: ScannedEvent[] = [];
    let maxTs = cp.ts;
    for (const r of rows) {
      const started = Number(r.started_at);
      if (started > maxTs) maxTs = started;
      const estimated = Number(r.estimated_cost_usd);
      const actual = Number(r.actual_cost_usd);
      events.push({
        rawId: String(r.id),
        source: 'hermes',
        provider: String(r.source ?? 'unknown'),
        model: String(r.model ?? 'unknown'),
        inputTokens: Number(r.input_tokens) || 0,
        outputTokens: Number(r.output_tokens) || 0,
        cacheReadTokens: Number(r.cache_read_tokens) || 0,
        cacheWriteTokens: Number(r.cache_write_tokens) || 0,
        costUsd: estimated > 0 ? estimated : actual > 0 ? actual : 0,
        sessionId: String(r.id),
        timestamp: Math.floor(started * 1000),
      });
    }
    return { events, checkpoint: { ts: maxTs, mtime: 0 } };
  } finally {
    db.close();
  }
}
