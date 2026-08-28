import { existsSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import type { Checkpoint, ScannedEvent } from '../types';
import { calculateCost, type ModelPricing } from '../pricing';

/**
 * DSH 用量数据（当前版本）：
 * - 主存储：~/.dsh/storages/session_projcache.json
 * - 结构：{ tables: { sessions: { [sessionId]: {
 *     identity: { createdAt: ms },
 *     rows: { tokenUsage: { val: { totals: {
 *       uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens
 *     } } } }
 *   } } } }
 * - 无直接 cost，按定价链计算；模型从 ~/.dsh/settings.yaml 的 agent-default-model.model 读取。
 * - 该文件会被 DSH 持续更新（同一 session 的 token 汇总会变化），所以使用全量替换语义。
 */
function readDefaultModel(storePath: string): string {
  const settingsPath = path.join(path.dirname(path.dirname(storePath)), 'settings.yaml');
  try {
    const text = readFileSync(settingsPath, 'utf-8');
    // 只解析 agent-default-model 块里的 model 字段，足够日常使用。
    const match = text.match(/agent-default-model:\s*\n(?:[ \t]*[^\n]*\n)*?[ \t]+model:\s*["']?([^"'\n]+)/);
    if (match?.[1]) return match[1].trim();
  } catch {
    // 忽略，使用 unknown
  }
  return 'unknown';
}

export function scanDsh(
  storePath: string,
  cp: Checkpoint,
  pricingProvider: (model: string) => ModelPricing | null
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  if (!existsSync(storePath)) return { events: [], checkpoint: cp };

  let stat;
  try {
    stat = statSync(storePath);
  } catch {
    return { events: [], checkpoint: cp };
  }
  if (stat.mtimeMs <= cp.mtime) return { events: [], checkpoint: cp };

  let data: { tables?: { sessions?: Record<string, unknown> } };
  try {
    data = JSON.parse(readFileSync(storePath, 'utf-8')) as typeof data;
  } catch {
    return { events: [], checkpoint: cp };
  }

  const sessions = data?.tables?.sessions ?? {};
  const defaultModel = readDefaultModel(storePath);
  const events: ScannedEvent[] = [];
  let maxTs = cp.ts;
  const maxMtime = stat.mtimeMs;

  for (const [sid, rawSession] of Object.entries(sessions)) {
    const session = rawSession as {
      identity?: { createdAt?: unknown };
      rows?: { tokenUsage?: { val?: { totals?: Record<string, unknown> } } };
    };
    const createdAt = Number(session.identity?.createdAt) || 0;

    const totals = session.rows?.tokenUsage?.val?.totals;
    if (!totals) continue;
    if (createdAt > maxTs) maxTs = createdAt;
    const input = Number(totals.uncachedInputTokens) || 0;
    const output = Number(totals.outputTokens) || 0;
    const cacheRead = Number(totals.cacheReadTokens) || 0;
    const cacheWrite = Number(totals.cacheWriteTokens) || 0;
    const pricing = pricingProvider(defaultModel);

    events.push({
      rawId: sid,
      source: 'dsh',
      provider: 'dsh',
      model: defaultModel,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      costUsd: pricing ? calculateCost({ input, output, cacheRead, cacheWrite }, pricing) : 0,
      sessionId: sid,
      timestamp: createdAt,
    });
  }

  return { events, checkpoint: { ts: maxTs, mtime: maxMtime } };
}
