import { existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import type { Checkpoint, ScannedEvent } from '../types';

export function scanCcSwitch(
  dbPath: string,
  cp: Checkpoint
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  if (!existsSync(dbPath)) return { events: [], checkpoint: cp };
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT request_id, app_type, model, input_tokens, output_tokens,
                  cache_read_tokens, cache_creation_tokens, total_cost_usd,
                  latency_ms, session_id, status_code, created_at
           FROM proxy_request_logs WHERE created_at > ? ORDER BY created_at`
        )
        .all(cp.ts) as Array<Record<string, unknown>>;
      const events: ScannedEvent[] = [];
      let maxTs = cp.ts;
      for (const r of rows) {
        const created = Number(r.created_at);
        if (created > maxTs) maxTs = created;
        if (Number(r.status_code) !== 200) continue;
        events.push({
          rawId: String(r.request_id),
          source: 'cc-switch',
          provider: String(r.app_type ?? 'unknown'),
          model: String(r.model ?? 'unknown'),
          inputTokens: Number(r.input_tokens) || 0,
          outputTokens: Number(r.output_tokens) || 0,
          cacheReadTokens: Number(r.cache_read_tokens) || 0,
          cacheWriteTokens: Number(r.cache_creation_tokens) || 0,
          costUsd: Number(r.total_cost_usd) || 0,
          latencyMs: r.latency_ms == null ? undefined : Number(r.latency_ms),
          sessionId: r.session_id == null ? undefined : String(r.session_id),
          timestamp: created * 1000,
        });
      }
      return { events, checkpoint: { ts: maxTs, mtime: 0 } };
    } finally {
      db.close();
    }
  } catch {
    return { events: [], checkpoint: cp };
  }
}
