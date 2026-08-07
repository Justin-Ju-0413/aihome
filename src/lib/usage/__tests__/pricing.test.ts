import { describe, it, expect } from 'vitest';
import { calculateCost, getPricing, loadCcSwitchPricing } from '../pricing';
import type { ModelPricing } from '../pricing';

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
    expect(getPricing('glm-5.2', cc)).toEqual(p);
  });
  it('falls back to bundled', () => {
    expect(getPricing('claude-sonnet-4-5', null)).not.toBeNull();
  });
  it('returns null for unknown model', () => {
    expect(getPricing('no-such-model', null)).toBeNull();
  });
});

describe('loadCcSwitchPricing', () => {
  it('returns null when db file missing', () => {
    expect(loadCcSwitchPricing('/nonexistent/db.sqlite')).toBeNull();
  });
});
