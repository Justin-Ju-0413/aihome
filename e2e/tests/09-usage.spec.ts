import { test, expect } from '@playwright/test';
import { selectors } from '../helpers/selectors';

test.describe('Usage Aggregator', () => {
  test('isolation guard: dev server must use .e2e-usage fixture paths', async ({ request }) => {
    const res = await request.get('/api/usage/sources');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const cc = data.sources.find((s: { id: string }) => s.id === 'cc-switch');
    expect(cc.path).toContain('.e2e-usage');
  });

  test('page renders overview, kline, stats, table from fixtures', async ({ page }) => {
    await page.goto('/usage');
    await expect(page.locator(selectors.usage.overview)).toBeVisible();
    await expect(page.locator(selectors.usage.klineChart)).toBeVisible();
    await expect(page.locator(selectors.usage.stats)).toBeVisible();
    await expect(page.locator(selectors.usage.table)).toBeVisible();
    const today = await page.locator(selectors.usage.overviewToday).innerText();
    expect(today).not.toBe('$0.00');
  });

  test('API aggregates multi-source events', async ({ request }) => {
    const res = await request.get('/api/usage/events?range=24h&source=all&dimension=cost');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.totals.requests).toBeGreaterThanOrEqual(4);
    expect(data.stats.bySource.length).toBeGreaterThanOrEqual(4);
    expect(data.sourceStatus.find((s: { id: string }) => s.id === 'openclaw').status).toBe('not-supported');
  });

  test('source filter narrows data', async ({ page }) => {
    await page.goto('/usage');
    await page.locator(selectors.usage.sourceClaude).click();
    await expect(page.locator(selectors.usage.table)).toContainText('claude');
  });

  test('rescan flow refreshes data', async ({ page }) => {
    await page.goto('/usage');
    await page.locator(selectors.usage.rescan).click();
    await expect(page.locator(selectors.usage.rescan)).toBeEnabled({ timeout: 20_000 });
    await expect(page.locator(selectors.usage.overview)).toBeVisible();
  });
});
