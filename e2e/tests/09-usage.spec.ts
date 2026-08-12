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

  test('stale header marks background reindex (fire-and-forget)', async ({ request }) => {
    // 必须是本组第一个触发索引的请求（fixture 全新库 → stale=true → 后台重索引）
    const first = await request.get('/api/usage/events?range=24h');
    expect(first.ok()).toBeTruthy();
    expect(first.headers()['x-stale']).toBe('true');
    // 后台索引完成后再次请求 → 数据新鲜
    const second = await request.get('/api/usage/events?range=24h');
    expect(second.ok()).toBeTruthy();
    expect(second.headers()['x-stale']).toBe('false');
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
    await expect(page.locator(selectors.usage.table)).not.toContainText('cc-switch');
  });

  test('range switching renders different kline data', async ({ page }) => {
    await page.goto('/usage');
    await expect(page.locator(selectors.usage.klineChart)).toBeVisible();
    await page.locator('[data-testid="usage-range-7d"]').click();
    await expect(page.locator(selectors.usage.klineChart)).toBeVisible();
    await expect(page.locator(selectors.usage.overview)).toBeVisible();
  });

  test('5m range returns empty kline for fresh fixtures', async ({ request }) => {
    const res = await request.get('/api/usage/events?range=5m&source=all');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.kline.length).toBe(0);
  });

  test('unknown pricing model shows badge in table', async ({ page }) => {
    await page.goto('/usage');
    // 展开 cc-switch 行，未知模型应带"未知定价"徽章
    await page.locator('tr', { hasText: 'cc-switch' }).first().click();
    await expect(page.locator('[data-testid="unknown-pricing-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="unknown-pricing-badge"]')).toHaveText('未知定价');
    await expect(page.locator('tr', { hasText: 'x-unknown-model-9x' })).toBeVisible();
  });

  test('rescan flow refreshes data', async ({ page }) => {
    await page.goto('/usage');
    await page.locator(selectors.usage.rescan).click();
    await expect(page.locator(selectors.usage.rescan)).toBeEnabled({ timeout: 20_000 });
    await expect(page.locator(selectors.usage.overview)).toBeVisible();
  });
});
