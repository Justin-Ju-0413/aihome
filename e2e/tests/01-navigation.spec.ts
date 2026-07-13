import { test, expect } from '../fixtures/test-data.fixture';
import { selectors } from '../helpers/selectors';

test.describe('Navigation & Routing', () => {
  test('root path redirects to /board', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/board/);
  });

  test('top nav has 4 navigation links', async ({ page }) => {
    await page.goto('/board');
    await expect(page.locator(selectors.nav.board)).toBeVisible();
    await expect(page.locator(selectors.nav.graph)).toBeVisible();
    await expect(page.locator(selectors.nav.agents)).toBeVisible();
    await expect(page.locator(selectors.nav.settings)).toBeVisible();
  });

  test('Board nav link navigates to /board', async ({ page }) => {
    await page.goto('/settings');
    await page.locator(selectors.nav.board).click();
    await expect(page).toHaveURL(/\/board/);
    await expect(page.locator('main h1')).toContainText('Agent Board');
  });

  test('Graph nav link navigates to /graph', async ({ page }) => {
    await page.goto('/board');
    await page.locator(selectors.nav.graph).click();
    await expect(page).toHaveURL(/\/graph/);
    await expect(page.locator('main h1')).toContainText('Agent Graph');
  });

  test('Agents nav link navigates to /agents', async ({ page }) => {
    await page.goto('/board');
    await page.locator(selectors.nav.agents).click();
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.locator('main h1')).toContainText('Agents');
  });

  test('Settings nav link navigates to /settings', async ({ page }) => {
    await page.goto('/board');
    await page.locator(selectors.nav.settings).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('main h1')).toContainText('Settings');
  });

  test('current page is highlighted in nav', async ({ page }) => {
    await page.goto('/board');
    const boardLink = page.locator(selectors.nav.board);
    await expect(boardLink).toHaveClass(/text-primary/);

    await page.locator(selectors.nav.settings).click();
    await expect(page).toHaveURL(/\/settings/);
    const settingsLink = page.locator(selectors.nav.settings);
    await expect(settingsLink).toHaveClass(/text-primary/);
  });

  test('logo links to root which redirects to board', async ({ page }) => {
    await page.goto('/settings');
    await page.locator('nav a[href="/"]').click();
    await expect(page).toHaveURL(/\/board/);
  });

  test('nav displays AIHome branding', async ({ page }) => {
    await page.goto('/board');
    await expect(page.locator('nav')).toContainText('AIHome');
  });
});
