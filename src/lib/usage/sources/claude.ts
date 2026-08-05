import * as fs from 'fs';
import * as path from 'path';
import type { Checkpoint, ScannedEvent } from '../types';
import { calculateCost, type ModelPricing } from '../pricing';

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function findUsage(d: Record<string, unknown>): RawUsage | null {
  if (d.usage && typeof d.usage === 'object') return d.usage as RawUsage;
  const msg = d.message;
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const m = msg as Record<string, unknown>;
    if (m.usage && typeof m.usage === 'object') return m.usage as RawUsage;
  }
  if (typeof msg === 'string') {
    try {
      const parsed = JSON.parse(msg) as Record<string, unknown>;
      if (parsed.usage && typeof parsed.usage === 'object') return parsed.usage as RawUsage;
    } catch {
      return null;
    }
  }
  return null;
}

function collectJsonlFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export function scanClaude(
  dir: string,
  cp: Checkpoint,
  pricingProvider: (model: string) => ModelPricing | null
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  const events: ScannedEvent[] = [];
  let maxMtime = cp.mtime;
  for (const file of collectJsonlFiles(dir)) {
    const stat = fs.statSync(file);
    if (stat.mtimeMs <= cp.mtime) continue;
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return;
      }
      if (d.type !== 'assistant') return;
      const usage = findUsage(d);
      if (!usage) return;
      const model = String(
        (d.message && typeof d.message === 'object'
          ? (d.message as Record<string, unknown>).model
          : d.model) ?? 'unknown'
      );
      const pricing = pricingProvider(model);
      const input = Number(usage.input_tokens) || 0;
      const output = Number(usage.output_tokens) || 0;
      const cacheRead = Number(usage.cache_read_input_tokens) || 0;
      const cacheWrite = Number(usage.cache_creation_input_tokens) || 0;
      events.push({
        rawId: `${path.basename(file)}:${String(d.uuid ?? idx)}`,
        source: 'claude',
        provider: 'claude-code',
        model,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        costUsd: pricing ? calculateCost({ input, output, cacheRead, cacheWrite }, pricing) : 0,
        sessionId: d.sessionId == null ? undefined : String(d.sessionId),
        timestamp: Date.parse(String(d.timestamp)),
      });
    });
  }
  return { events, checkpoint: { ts: cp.ts, mtime: maxMtime } };
}
