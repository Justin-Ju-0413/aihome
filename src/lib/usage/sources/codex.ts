import * as fs from 'fs';
import * as path from 'path';
import type { Checkpoint, ScannedEvent } from '../types';
import { calculateCost, type PricingLookup } from '../pricing';

export function scanCodex(
  dir: string,
  cp: Checkpoint,
  pricingProvider: (model: string) => PricingLookup
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  const events: ScannedEvent[] = [];
  let maxMtime = cp.mtime;
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.jsonl')) scanFile(p);
    }
  };
  const scanFile = (file: string) => {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return;
    }
    if (stat.mtimeMs <= cp.mtime) return;
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    let currentModel = 'unknown';
    let lines: string[];
    try {
      lines = fs.readFileSync(file, 'utf-8').split('\n');
    } catch {
      return;
    }
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return;
      }
      const payload = (d.payload ?? {}) as Record<string, unknown>;
      const model = payload.model;
      if (typeof model === 'string' && model) currentModel = model;
      if (payload.type !== 'token_count') return;
      const info = payload.info as
        | { last_token_usage?: Record<string, number> }
        | null
        | undefined;
      const usage = info?.last_token_usage;
      if (!usage) return;
      const input = Number(usage.input_tokens) || 0;
      const output = Number(usage.output_tokens) || 0;
      const cacheRead = Number(usage.cached_input_tokens) || 0;
      const lookup = pricingProvider(currentModel);
      const rawTs = d.timestamp;
      const parsed = typeof rawTs === 'string' ? Date.parse(rawTs) : NaN;
      const timestamp = Number.isFinite(parsed) ? parsed : Number(rawTs) || 0;
      events.push({
        rawId: `${path.basename(file)}:${String(d.id ?? idx)}`,
        source: 'codex',
        provider: 'codex',
        model: currentModel,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: 0,
        costUsd: lookup.pricing
          ? calculateCost({ input, output, cacheRead, cacheWrite: 0 }, lookup.pricing)
          : 0,
        pricingSource: lookup.source,
        sessionId: d.session_id == null ? undefined : String(d.session_id),
        timestamp,
      });
    });
  };
  walk(dir);
  return { events, checkpoint: { ts: cp.ts, mtime: maxMtime } };
}
