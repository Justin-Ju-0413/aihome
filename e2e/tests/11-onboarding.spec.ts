import { test, expect } from '@playwright/test';
import { forceZh } from '../helpers/zh-lang';
import * as fs from 'fs';
import * as path from 'path';

// 与 playwright.config.ts 的 AIHOME_CONFIG_DIR 同路径（e2e worker 看不到 webServer env）
const CONFIG_PATH = path.join(__dirname, '..', '.e2e-sync', 'config', 'config.json');
// 用真实存在的样例目录做预览目标
const SAMPLE_DIR = path.resolve(__dirname, '..', '..', 'data', 'sample-agents');

test.describe('Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await forceZh(page);
  });

  test.beforeAll(() => {
    fs.rmSync(CONFIG_PATH, { force: true });
  });

  test.afterAll(() => {
    fs.rmSync(CONFIG_PATH, { force: true });
  });

  test('first launch without config redirects to onboarding wizard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByText('欢迎使用 AIHome')).toBeVisible();
  });

  test('wizard: choose dir → preview scan → save', async ({ page }) => {
    await page.goto('/onboarding');

    await page.getByTestId('onboarding-paths').fill(SAMPLE_DIR);
    await page.getByRole('button', { name: /下一步/ }).click();
    await page.getByTestId('onboarding-preview').click();

    await expect(page.getByTestId('onboarding-count')).toContainText('4', { timeout: 15000 });
    await page.getByTestId('onboarding-save').click();

    await expect(page).toHaveURL(/\/board/);
    // 保存落盘：config.json 存在且 paths 指向样例目录
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    expect(saved.paths).toContain(SAMPLE_DIR);
  });
});
