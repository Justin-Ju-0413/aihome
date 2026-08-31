import * as fs from 'fs';
import * as path from 'path';
import type { Checkpoint, ScannedEvent } from '../types';
import { calculateCost, type ModelPricing } from '../pricing';

/**
 * ZCode 用量数据（当前版本）：
 * - 目录：~/.zcode/cli/rollout/
 * - 文件：model-io-sess_*.jsonl，每行一次模型请求
 * - 每行结构：
 *   {
 *     completedAt: ISO 时间,
 *     requestId: string,
 *     model: { modelId, providerId },
 *     response: { usage: { inputTokens, outputTokens, cacheReadTokens, reasoningTokens, totalTokens } }
 *   }
 * - 无直接 cost，按定价链计算。
 */
export function scanZcode(
  dir: string,
  cp: Checkpoint,
  pricingProvider: (model: string) => ModelPricing | null
): { events: ScannedEvent[]; checkpoint: Checkpoint } {
  if (!fs.existsSync(dir)) return { events: [], checkpoint: cp };

  const events: ScannedEvent[] = [];
  let maxMtime = cp.mtime;
  let maxTs = cp.ts;

  const root = path.resolve(dir);
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) continue;
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (stat.mtimeMs <= cp.mtime) continue;
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;

    let lines: string[];
    try {
      lines = fs.readFileSync(file, 'utf-8').split('\n');
    } catch {
      continue;
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
      const response = d.response as { usage?: Record<string, number> } | null | undefined;
      const usage = response?.usage;
      if (!usage || typeof usage !== 'object') return;

      const modelObj = d.model as { modelId?: unknown; providerId?: unknown } | null | undefined;
      const model = typeof modelObj?.modelId === 'string' ? modelObj.modelId : 'unknown';
      const provider = typeof modelObj?.providerId === 'string' ? modelObj.providerId : 'zcode';

      const input = Number(usage.inputTokens) || 0;
      const output = Number(usage.outputTokens) || 0;
      const cacheRead = Number(usage.cacheReadTokens) || 0;
      const cacheWrite = Number(usage.cacheWriteTokens) || 0;
      const pricing = pricingProvider(model);

      const rawTs = d.completedAt;
      const parsed = typeof rawTs === 'string' ? Date.parse(rawTs) : NaN;
      const timestamp = Number.isFinite(parsed) ? parsed : 0;
      if (timestamp > maxTs) maxTs = timestamp;

      events.push({
        rawId: `${name}:${String(d.requestId ?? idx)}`,
        source: 'zcode',
        provider,
        model,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        costUsd: pricing ? calculateCost({ input, output, cacheRead, cacheWrite }, pricing) : 0,
        sessionId: d.requestId == null ? undefined : String(d.requestId),
        timestamp,
      });
    });
  }

  return { events, checkpoint: { ts: maxTs, mtime: maxMtime } };
}
