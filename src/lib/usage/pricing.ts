import { existsSync, readFileSync, statSync } from 'fs';
import path from 'node:path';
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

/** provider 前缀 fallback 池：未知具体型号时的行业均价兜底（v0.3 P0-2） */
export const PROVIDER_FALLBACK_PRICING: Array<{ prefix: string; pricing: ModelPricing }> = [
  { prefix: 'claude-', pricing: { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 } },
  { prefix: 'gpt-', pricing: { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.1, cacheWritePerM: 1.25 } },
  { prefix: 'deepseek-', pricing: { inputPerM: 0.5, outputPerM: 2, cacheReadPerM: 0.1, cacheWritePerM: 0.5 } },
  { prefix: 'glm-', pricing: { inputPerM: 0.6, outputPerM: 2.5, cacheReadPerM: 0.1, cacheWritePerM: 0.6 } },
  { prefix: 'gemini-', pricing: { inputPerM: 1.25, outputPerM: 5, cacheReadPerM: 0.1, cacheWritePerM: 1.25 } },
];

export type PricingSource = 'override' | 'ccswitch' | 'bundled' | 'fallback' | 'unknown';

export function pricingOverridePath(): string {
  return process.env.AIHOME_PRICING_OVERRIDE ?? path.join(process.cwd(), 'data', 'pricing-override.json');
}

// 用户自定义定价（最高优先级）：惰性加载 + mtime 缓存（文件改动后自动重读）
let overrideCache: { mtimeMs: number; data: Record<string, ModelPricing> | null } | null = null;

export function loadPricingOverride(): Record<string, ModelPricing> | null {
  const p = pricingOverridePath();
  let st;
  try {
    st = statSync(p);
  } catch {
    overrideCache = null;
    return null;
  }
  if (overrideCache && overrideCache.mtimeMs === st.mtimeMs) return overrideCache.data;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as Record<string, ModelPricing>;
    overrideCache = { mtimeMs: st.mtimeMs, data: parsed };
    return parsed;
  } catch {
    overrideCache = { mtimeMs: st.mtimeMs, data: null };
    return null;
  }
}

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

/** 五层定价解析（v0.3 P0-2）：override JSON → cc-switch DB → 内置表 → provider 前缀池 → unknown */
export function getPricingWithStatus(
  model: string,
  ccSwitchPricing?: Record<string, ModelPricing> | null
): { pricing: ModelPricing | null; source: PricingSource } {
  const override = loadPricingOverride();
  if (override?.[model]) return { pricing: override[model], source: 'override' };
  if (ccSwitchPricing?.[model]) return { pricing: ccSwitchPricing[model], source: 'ccswitch' };
  if (BUNDLED_PRICING[model]) return { pricing: BUNDLED_PRICING[model], source: 'bundled' };
  const fallback = PROVIDER_FALLBACK_PRICING.find((f) => model.startsWith(f.prefix));
  if (fallback) return { pricing: fallback.pricing, source: 'fallback' };
  return { pricing: null, source: 'unknown' };
}

export function getPricing(
  model: string,
  ccSwitchPricing?: Record<string, ModelPricing> | null
): ModelPricing | null {
  return getPricingWithStatus(model, ccSwitchPricing).pricing;
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
