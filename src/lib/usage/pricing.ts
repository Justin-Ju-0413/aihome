import { existsSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';

export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  cacheWritePerM: number;
}

export const BUNDLED_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-7': { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  'claude-sonnet-4-5': { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  'claude-3-7-sonnet-20250219': { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10, cacheReadPerM: 1.25, cacheWritePerM: 2.5 },
  'gpt-5.5': { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.1, cacheWritePerM: 1.25 },
  'gpt-5.6-terra': { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.1, cacheWritePerM: 1.25 },
  'deepseek-v4-flash-free': { inputPerM: 0, outputPerM: 0, cacheReadPerM: 0, cacheWritePerM: 0 },
  'glm-5.2': { inputPerM: 0.6, outputPerM: 2.5, cacheReadPerM: 0.1, cacheWritePerM: 0.6 },
};

export function calculateCost(
  u: { input: number; output: number; cacheRead: number; cacheWrite: number },
  p: ModelPricing
): number {
  const input = Math.max(0, u.input - u.cacheRead - u.cacheWrite);
  return (
    input * p.inputPerM +
    u.cacheRead * p.cacheReadPerM +
    u.cacheWrite * p.cacheWritePerM +
    u.output * p.outputPerM
  ) / 1e6;
}

export function getPricing(
  model: string,
  ccSwitchPricing?: Record<string, ModelPricing> | null
): ModelPricing | null {
  return ccSwitchPricing?.[model] ?? BUNDLED_PRICING[model] ?? null;
}

export function loadCcSwitchPricing(dbPath: string): Record<string, ModelPricing> | null {
  if (!existsSync(dbPath)) return null;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT model_id, input_cost_per_million, output_cost_per_million,
                  cache_read_cost_per_million, cache_creation_cost_per_million
           FROM model_pricing`
        )
        .all() as Array<Record<string, unknown>>;
      const out: Record<string, ModelPricing> = {};
      for (const r of rows) {
        const input = Number(r.input_cost_per_million);
        const output = Number(r.output_cost_per_million);
        if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
        out[String(r.model_id)] = {
          inputPerM: input,
          outputPerM: output,
          cacheReadPerM: Number(r.cache_read_cost_per_million) || 0,
          cacheWritePerM: Number(r.cache_creation_cost_per_million) || 0,
        };
      }
      return out;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
