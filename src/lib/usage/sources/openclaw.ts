import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { Checkpoint, ScannedEvent } from '../types';

// OpenClaw 用量数据（当前版本，rollup v2）：
// - 每 agent 一个 SQLite：<agentsRoot>/<agentId>/agent/openclaw-agent.sqlite
// - cache_entries 是 KV 表 (scope, key, value_json, blob, expires_at, updated_at)，
//   用量汇总存 scope='session-cost-usage-rollup-v2' 的行
// - value_json = { version: 2, pricingFingerprint, checkpoint, scannedAt,
//   parsedRecords, countedRecords, rollup: { buckets, lastUserTimestamp, untimestamped } }
// - bucket = { timestampMs, totals, messageCounts, tools, models[], latency }
//   models[] = { provider?, model?, count, totals: CostUsageTotals }
// - 本适配器按 models 拆事件（model 粒度），cost 直接用 OpenClaw 算好的 totalCost
const ROLLUP_V2_SCOPE = 'session-cost-usage-rollup-v2';
const ROLLUP_VERSION = 2;

type CostTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
};

type RollupModel = { provider?: string; model?: string; count: number; totals: CostTotals };

type RollupBucket = {
  timestampMs: number;
  totals: CostTotals;
  models: RollupModel[];
};

type RollupData = {
  buckets: Record<string, RollupBucket>;
  lastUserTimestamp?: number;
  untimestamped: { totals: CostTotals; models: RollupModel[] };
};

type RollupEntry = {
  version: number;
  scannedAt: number;
  rollup: RollupData;
};

function parseRollupEntry(valueJson: string): RollupEntry | null {
  try {
    const raw = JSON.parse(valueJson) as Partial<RollupEntry>;
    if (raw.version !== ROLLUP_VERSION || !raw.rollup || typeof raw.scannedAt !== 'number') return null;
    return raw as RollupEntry;
  } catch {
    return null;
  }
}

function emptyCostTotals(): CostTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, totalCost: 0 };
}

/** 全零 totals（无 tokens 也无 cost）视为无用量，跳过不发事件 */
function hasUsage(totals: CostTotals): boolean {
  return (totals?.totalTokens ?? 0) > 0 || (totals?.totalCost ?? 0) > 0;
}

function modelEvent(
  agentId: string,
  rollupKey: string,
  model: RollupModel,
  timestamp: number
): ScannedEvent {
  const provider = model.provider ?? 'unknown';
  const name = model.model ?? 'unknown';
  return {
    rawId: `${agentId}:${rollupKey}:${provider}\0${name}`,
    source: 'openclaw',
    provider,
    model: name,
    inputTokens: model.totals?.input ?? 0,
    outputTokens: model.totals?.output ?? 0,
    cacheReadTokens: model.totals?.cacheRead ?? 0,
    cacheWriteTokens: model.totals?.cacheWrite ?? 0,
    costUsd: model.totals?.totalCost ?? 0,
    sessionId: rollupKey,
    timestamp,
  };
}

function totalsEvent(
  agentId: string,
  rollupKey: string,
  totals: CostTotals,
  timestamp: number
): ScannedEvent {
  return {
    rawId: `${agentId}:${rollupKey}:unknown`,
    source: 'openclaw',
    provider: 'unknown',
    model: 'unknown',
    inputTokens: totals.input,
    outputTokens: totals.output,
    cacheReadTokens: totals.cacheRead,
    cacheWriteTokens: totals.cacheWrite,
    costUsd: totals.totalCost,
    sessionId: rollupKey,
    timestamp,
  };
}

export function scanOpenclaw(
  agentsRoot: string,
  cp: Checkpoint
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  if (!existsSync(agentsRoot)) return { events: [], checkpoint: cp };

  const events: ScannedEvent[] = [];
  let maxTs = cp.ts;
  let maxMtime = cp.mtime;

  for (const agentId of readdirSync(agentsRoot)) {
    const dbPath = join(agentsRoot, agentId, 'agent', 'openclaw-agent.sqlite');
    if (!existsSync(dbPath)) continue;
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      const rows = db
        .prepare(
          `SELECT key, value_json, updated_at FROM cache_entries
           WHERE scope = ? ORDER BY updated_at`
        )
        .all(ROLLUP_V2_SCOPE) as Array<{ key: string; value_json: string | null; updated_at: number }>;
      for (const row of rows) {
        if (!row.value_json) continue;
        const updatedAt = Number(row.updated_at) || 0;
        if (updatedAt > maxMtime) maxMtime = updatedAt;
        const entry = parseRollupEntry(row.value_json);
        if (!entry) continue;
        // 行级 checkpoint：行内最大 ts ≤ cp.ts 且 updated_at ≤ cp.mtime → 已扫描过，跳过
        const rowTs = Math.max(
          entry.scannedAt,
          ...Object.values(entry.rollup.buckets ?? {}).map((b) => b.timestampMs)
        );
        if (rowTs <= cp.ts && updatedAt <= cp.mtime) continue;
        // 每个 bucket 的 models 拆事件（ts = bucket 毫秒时间戳）
        for (const bucket of Object.values(entry.rollup.buckets ?? {})) {
          if (bucket.timestampMs > maxTs) maxTs = bucket.timestampMs;
          const models = bucket.models ?? [];
          if (models.length === 0) {
            if (hasUsage(bucket.totals ?? emptyCostTotals())) {
              events.push(totalsEvent(agentId, row.key, bucket.totals ?? emptyCostTotals(), bucket.timestampMs));
            }
          } else {
            for (const m of models) events.push(modelEvent(agentId, row.key, m, bucket.timestampMs));
          }
        }
        // 无时间戳的用量：用 scannedAt 兜底，避免静默丢失
        const untimestamped = entry.rollup.untimestamped;
        if (untimestamped) {
          const ts = entry.scannedAt;
          if (ts > maxTs) maxTs = ts;
          const models = untimestamped.models ?? [];
          if (models.length === 0) {
            if (hasUsage(untimestamped.totals ?? emptyCostTotals())) {
              events.push(totalsEvent(agentId, row.key, untimestamped.totals ?? emptyCostTotals(), ts));
            }
          } else {
            for (const m of models) events.push(modelEvent(agentId, row.key, m, ts));
          }
        }
      }
    } catch {
      // 单个 agent 库损坏/占用 → 跳过该 agent，不影响其他
    } finally {
      db?.close();
    }
  }

  return { events, checkpoint: { ts: maxTs, mtime: maxMtime } };
}
