import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { calculateCost, getPricing, getPricingWithStatus, loadCcSwitchPricing } from '../pricing';
import type { ModelPricing } from '../pricing';

const p: ModelPricing = { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 };

afterEach(() => {
  delete process.env.AIHOME_PRICING_OVERRIDE;
});

describe('calculateCost', () => {
  it('computes cost with cache semantics', () => {
    expect(
      calculateCost({ input: 1000, output: 100, cacheRead: 200, cacheWrite: 50 }, p)
    ).toBeCloseTo((750 * 5 + 200 * 0.5 + 50 * 6.25 + 100 * 25) / 1e6, 10);
  });
});

describe('getPricing five-tier fallback (v0.3 P0-2)', () => {
  it('tier 1: user override JSON wins over everything', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-'));
    fs.writeFileSync(path.join(dir, 'override.json'), JSON.stringify({ 'claude-sonnet-4-5': p }));
    process.env.AIHOME_PRICING_OVERRIDE = path.join(dir, 'override.json');
    const r = getPricingWithStatus('claude-sonnet-4-5', null);
    expect(r.source).toBe('override');
    expect(r.pricing).toEqual(p);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('tier 2: cc-switch pricing beats bundled', () => {
    const cc: Record<string, ModelPricing> = { 'glm-5.2': p };
    const r = getPricingWithStatus('glm-5.2', cc);
    expect(r.source).toBe('ccswitch');
    expect(r.pricing).toEqual(p);
  });
  it('tier 3: bundled pricing', () => {
    const r = getPricingWithStatus('claude-sonnet-4-5', null);
    expect(r.source).toBe('bundled');
    expect(r.pricing).not.toBeNull();
  });
  it('tier 4: provider prefix fallback pool', () => {
    const r = getPricingWithStatus('deepseek-v4-flash', null);
    expect(r.source).toBe('fallback');
    expect(r.pricing?.inputPerM).toBeGreaterThan(0);
    expect(getPricingWithStatus('gemini-2.5-pro', null).source).toBe('fallback');
    expect(getPricingWithStatus('claude-anything-new', null).source).toBe('fallback');
  });
  it('tier 5: unknown model -> null + unknown marker', () => {
    const r = getPricingWithStatus('no-such-model-9x', null);
    expect(r.source).toBe('unknown');
    expect(r.pricing).toBeNull();
    expect(getPricing('no-such-model-9x', null)).toBeNull();
  });
  it('override JSON with invalid content degrades to next tiers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-'));
    fs.writeFileSync(path.join(dir, 'override.json'), 'not json');
    process.env.AIHOME_PRICING_OVERRIDE = path.join(dir, 'override.json');
    expect(getPricing('claude-sonnet-4-5', null)).not.toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('loadCcSwitchPricing', () => {
  it('returns null when db file missing', () => {
    expect(loadCcSwitchPricing('/nonexistent/db.sqlite')).toBeNull();
  });
});
