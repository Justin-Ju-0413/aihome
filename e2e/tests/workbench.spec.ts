import { test, expect } from '@playwright/test';

test.describe('workbench', () => {
  // 测试共享同一 dev server + DB，每个用例前清空 keys 保证隔离
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/workbench/keys/clear-all');
  });

  test('seeds builtin platforms grouped by category, search and filter work', async ({ page }) => {
    await page.goto('/workbench');
    await expect(page.getByTestId('site-card-deepseek-开放平台')).toBeVisible();
    await expect(page.getByTestId('group-API平台')).toBeVisible();
    await page.getByPlaceholder(/搜索/).fill('deepseek');
    await expect(page.getByTestId('site-card-deepseek-开放平台')).toBeVisible();
    await expect(page.getByTestId('site-card-chatgpt')).toHaveCount(0);
    await page.getByPlaceholder(/搜索/).fill('');
    await page.getByRole('combobox').selectOption('对话');
    await expect(page.getByTestId('group-对话')).toBeVisible();
    await expect(page.getByTestId('group-API平台')).toHaveCount(0);
  });

  test('adds, edits and deletes a custom site', async ({ page }) => {
    await page.goto('/workbench');
    await page.getByTestId('add-site').click();
    await page.getByLabel('名称').fill('我的测试站');
    await page.getByLabel('网址').fill('https://example.com');
    await page.getByLabel('分类').selectOption('其他');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByTestId('site-card-我的测试站')).toBeVisible();

    await page.getByTestId('site-card-我的测试站').getByRole('button', { name: '编辑' }).click();
    await page.getByLabel('名称').fill('我的测试站改');
    await page.getByRole('button', { name: '保存' }).click();
    // id(slug) 稳定不变，改名只反映在卡片内容
    await expect(page.getByTestId('site-card-我的测试站')).toContainText('我的测试站改');

    await page.getByTestId('site-card-我的测试站').getByRole('button', { name: '编辑' }).click();
    await page.getByRole('button', { name: '删除' }).click();
    await expect(page.getByTestId('site-card-我的测试站')).toHaveCount(0);
  });

  test('configures good deepseek key → balance badge shows balance', async ({ page }) => {
    await page.goto('/workbench');
    const card = page.getByTestId('site-card-deepseek-开放平台');
    await card.getByRole('button', { name: '配置' }).click();
    await page.getByLabel('label').fill('e2e key');
    await page.getByLabel('provider').selectOption('deepseek');
    await page.getByLabel('key').fill('sk-good-deepseek');
    await page.getByRole('button', { name: '保存' }).click();
    await page.getByRole('button', { name: '刷新' }).click();
    await expect(page.getByTestId('balance-ok')).toContainText('110.00');
  });

  test('bad key shows invalid badge; openai shows unsupported', async ({ page }) => {
    await page.goto('/workbench');
    // bad deepseek key（保存后自动成为当前 key）
    const card = page.getByTestId('site-card-deepseek-开放平台');
    await card.getByRole('button', { name: '配置' }).click();
    await page.getByLabel('key').fill('sk-bad-deepseek');
    await page.getByRole('button', { name: '保存' }).click();
    await card.getByRole('button', { name: '刷新' }).click();
    await expect(page.getByTestId('balance-invalid')).toBeVisible();

    // openai → unsupported (mock 404)
    const oa = page.getByTestId('site-card-openai-platform');
    await oa.getByRole('button', { name: '配置' }).click();
    await page.getByLabel('provider').selectOption('openai');
    await page.getByLabel('key').fill('sk-oa');
    await page.getByRole('button', { name: '保存' }).click();
    await oa.getByRole('button', { name: '刷新' }).click();
    await expect(page.getByTestId('balance-unsupported')).toBeVisible();
  });

  test('settings: refresh all, clear keys, restore builtins', async ({ page }) => {
    await page.goto('/workbench');
    const card = page.getByTestId('site-card-deepseek-开放平台');
    await card.getByRole('button', { name: '配置' }).click();
    await page.getByLabel('key').fill('sk-good-deepseek');
    await page.getByRole('button', { name: '保存' }).click();

    await page.goto('/settings');
    await page.getByTestId('btn-refresh-all').click();
    await expect(page.getByTestId('settings-msg')).toContainText('已刷新 1');

    // confirm 对话框要先注册监听再点击
    page.on('dialog', (d) => d.accept());
    await page.getByTestId('btn-clear-keys').click();
    await expect(page.getByTestId('settings-msg')).toContainText('已清除 1');

    await page.goto('/workbench');
    await page.getByTestId('site-card-deepseek-开放平台').getByRole('button', { name: '配置' }).first().click();
  });
});
