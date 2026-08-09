import { existsSync, readFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';

export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  cacheWritePerM: number;
}

export type PricingSource = 'override' | 'cc-switch' | 'bundled' | 'provider-prefix' | 'unknown';

export interface PricingLookup {
  pricing: ModelPricing | null;
  source: PricingSource;
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

// 行业均价（按 provider 前缀回退），可调
export const PROVIDER_FALLBACK_PRICING: Record<string, ModelPricing> = {
  'claude-': { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.4, cacheWritePerM: 5 },
  'gpt-': { inputPerM: 2.5, outputPerM: 10, cacheReadPerM: 1.25, cacheWritePerM: 2.5 },
  'deepseek-': { inputPerM: 0.27, outputPerM: 1.1, cacheReadPerM: 0.07, cacheWritePerM: 0.27 },
  'glm-': { inputPerM: 0.6, outputPerM: 2.5, cacheReadPerM: 0.1, cacheWritePerM: 0.6 },
  'gemini-': { inputPerM: 0.7, outputPerM: 2.8, cacheReadPerM: 0.1, cacheWritePerM: 0.35 },
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
  ccSwitchPricing?: Record<string, ModelPricing> | null,
  overrides?: Record<string, ModelPricing> | null
): PricingLookup {
  if (overrides && overrides[model]) return { pricing: overrides[model], source: 'override' };
  if (ccSwitchPricing?.[model]) return { pricing: ccSwitchPricing[model], source: 'cc-switch' };
  if (BUNDLED_PRICING[model]) return { pricing: BUNDLED_PRICING[model], source: 'bundled' };
  for (const [prefix, pricing] of Object.entries(PROVIDER_FALLBACK_PRICING)) {
    if (model.startsWith(prefix)) return { pricing, source: 'provider-prefix' };
  }
  return { pricing: null, source: 'unknown' };
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

export function loadPricingOverrides(overridesPath: string): Record<string, ModelPricing> | null {
  if (!existsSync(overridesPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(overridesPath, 'utf-8')) as Record<string, unknown>;
    const out: Record<string, ModelPricing> = {};
    for (const [model, v] of Object.entries(raw)) {
      const o = v as Record<string, unknown>;
      const inputPerM = Number(o.inputPerM);
      const outputPerM = Number(o.outputPerM);
      if (!Number.isFinite(inputPerM) || !Number.isFinite(outputPerM)) continue;
      out[model] = {
        inputPerM,
        outputPerM,
        cacheReadPerM: Number(o.cacheReadPerM) || 0,
        cacheWritePerM: Number(o.cacheWritePerM) || 0,
      };
    }
    return out;
  } catch (err) {
    console.error(`pricing overrides parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
