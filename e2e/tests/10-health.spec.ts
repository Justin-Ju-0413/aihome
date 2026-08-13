import { test, expect } from '../fixtures/test-data.fixture';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Health Panel', () => {
  test('reports nothing for healthy workspace', async ({ page }) => {
    await page.goto('/health');
    await expect(page.getByTestId('health-ok')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('health-issues')).toHaveCount(0);
  });

  test('reports duplicate agent names', async ({ page, testData }) => {
    testData.createAgent('Dup Name', 'agent', 'first');
    // 第二个同名 agent：不同目录但 AGENTS.md 的 H1 同名（createAgent 会 slug 化到同一目录）
    const second = path.join(__dirname, '..', '..', 'data', 'test-agents', 'dup-name-2');
    fs.mkdirSync(second, { recursive: true });
    fs.writeFileSync(path.join(second, 'AGENTS.md'), '# Dup Name\n\nsecond\n');
    await page.goto('/health');
    await expect(page.getByTestId('health-issues')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('health-issues').getByText('重名 agent')).toBeVisible();
    await expect(page.getByTestId('health-issues')).toContainText('Dup Name');
  });

  test('settings page links to health panel', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-health-link').click();
    await expect(page).toHaveURL(/\/health/);
    await expect(page.getByText('工作区健康')).toBeVisible();
  });
});
