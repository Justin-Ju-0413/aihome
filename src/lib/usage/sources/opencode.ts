import { existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import type { Checkpoint, ScannedEvent } from '../types';

export function scanOpencode(
  dbPath: string,
  cp: Checkpoint
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  if (!existsSync(dbPath)) return { events: [], checkpoint: cp };
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT s.id, s.cost, s.tokens_input, s.tokens_output, s.tokens_reasoning, s.time_created,
                  (SELECT json_extract(data, '$.model.modelID') FROM message m
                   WHERE m.session_id = s.id ORDER BY m.time_created LIMIT 1) AS model
           FROM session s WHERE s.time_created > ? ORDER BY s.time_created`
        )
        .all(cp.ts) as Array<Record<string, unknown>>;
      const events: ScannedEvent[] = [];
      let maxTs = cp.ts;
      for (const r of rows) {
        const created = Number(r.time_created);
        if (created > maxTs) maxTs = created;
        events.push({
          rawId: String(r.id),
          source: 'opencode',
          provider: 'opencode',
          model: r.model == null || r.model === '' ? 'unknown' : String(r.model),
          inputTokens: Number(r.tokens_input) || 0,
          outputTokens: Number(r.tokens_output) || 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: Number(r.cost) || 0,
          sessionId: String(r.id),
          timestamp: created,
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
