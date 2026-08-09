import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { calculateCost, getPricing, loadCcSwitchPricing, loadPricingOverrides, BUNDLED_PRICING, PROVIDER_FALLBACK_PRICING } from '../pricing';
import type { ModelPricing } from '../pricing';
import { tmpDir, rmTmp } from './fixtures';

const p: ModelPricing = { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 };

describe('calculateCost', () => {
  it('computes cost with cache semantics', () => {
    expect(
      calculateCost({ input: 1000, output: 100, cacheRead: 200, cacheWrite: 50 }, p)
    ).toBeCloseTo((750 * 5 + 200 * 0.5 + 50 * 6.25 + 100 * 25) / 1e6, 10);
  });
});

describe('getPricing', () => {
  it('prefers cc-switch pricing over bundled', () => {
    const cc: Record<string, ModelPricing> = { 'glm-5.2': p };
    expect(getPricing('glm-5.2', cc)).toEqual({ pricing: p, source: 'cc-switch' });
  });
  it('falls back to bundled', () => {
    expect(getPricing('claude-sonnet-4-5', null)).not.toBeNull();
  });
  it('returns unknown for unknown model', () => {
    expect(getPricing('no-such-model', null)).toEqual({ pricing: null, source: 'unknown' });
  });
});

describe('loadCcSwitchPricing', () => {
  it('returns null when db file missing', () => {
    expect(loadCcSwitchPricing('/nonexistent/db.sqlite')).toBeNull();
  });
});

const pdir = tmpDir('pricing-');
afterAll(() => rmTmp(pdir));

describe('getPricing five-tier fallback', () => {
  const cc: Record<string, ModelPricing> = { 'glm-5.2': p };
  const overrides: Record<string, ModelPricing> = {
    'claude-opus-4-7': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 0.1, cacheWritePerM: 0.2 },
  };
  it('override wins over everything', () => {
    expect(getPricing('claude-opus-4-7', cc, overrides)).toEqual({
      pricing: overrides['claude-opus-4-7'], source: 'override',
    });
  });
  it('cc-switch beats bundled and prefix', () => {
    expect(getPricing('glm-5.2', cc)).toEqual({ pricing: p, source: 'cc-switch' });
  });
  it('bundled beats provider-prefix', () => {
    const r = getPricing('gpt-4o', null);
    expect(r.source).toBe('bundled');
    expect(r.pricing).toEqual(BUNDLED_PRICING['gpt-4o']);
  });
  it('provider prefix matches unmapped family', () => {
    const r = getPricing('claude-4-x', null);
    expect(r.source).toBe('provider-prefix');
    expect(r.pricing).toEqual(PROVIDER_FALLBACK_PRICING['claude-']);
  });
  it('gemini prefix matches', () => {
    expect(getPricing('gemini-2.5-pro', null).source).toBe('provider-prefix');
  });
  it('no match -> unknown with null pricing', () => {
    expect(getPricing('no-such-model', null)).toEqual({ pricing: null, source: 'unknown' });
  });
  it('no overrides arg skips override tier', () => {
    expect(getPricing('claude-opus-4-7', null).source).toBe('bundled');
  });
});

describe('loadPricingOverrides', () => {
  it('returns null when file missing', () => {
    expect(loadPricingOverrides('/nonexistent/overrides.json')).toBeNull();
  });
  it('parses valid file', () => {
    const f = path.join(pdir, 'overrides.json');
    fs.writeFileSync(f, JSON.stringify({
      'my-model': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 0.1, cacheWritePerM: 0.2 },
    }));
    expect(loadPricingOverrides(f)).toEqual({
      'my-model': { inputPerM: 1, outputPerM: 2, cacheReadPerM: 0.1, cacheWritePerM: 0.2 },
    });
  });
  it('returns null and logs for invalid JSON', () => {
    const f = path.join(pdir, 'bad.json');
    fs.writeFileSync(f, '{nope');
    expect(loadPricingOverrides(f)).toBeNull();
  });
});
