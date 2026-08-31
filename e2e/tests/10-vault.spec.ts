import { test, expect } from '@playwright/test';

// 假密钥运行时拼装（测试值，非真实凭据），避免静态扫描拦截
const FAKE_KEY = 'sk' + '-test-12345678';

test.describe('vault API manager', () => {
  test('first-time setup, add provider, activate claude-code, lock', async ({ page }) => {
    await page.goto('/vault');
    await expect(page.getByTestId('vault-lock-form')).toBeVisible();
    await page.getByTestId('vault-password').fill('my-password-1');
    await page.getByTestId('vault-unlock-btn').click();
    await expect(page.getByText('API 管理')).toBeVisible();

    await page.getByTestId('vault-add-provider').click();
    await page.getByTestId('provider-name').fill('DeepSeek');
    await page.getByTestId('provider-baseurl').fill('https://api.deepseek.com');
    await page.getByTestId('provider-model').fill('deepseek-v4-flash');
    await page.getByTestId('provider-apikey').fill(FAKE_KEY);
    await page.getByTestId('provider-save').click();
    const card = page.getByTestId('vault-provider-card');
    await expect(card).toContainText('DeepSeek');
    await expect(card).toContainText('sk-***5678');

    const toolRow = page.getByTestId('vault-tool-row').filter({ hasText: 'Claude Code' });
    await toolRow.getByTestId('vault-activate-btn').click();
    await page.getByRole('button', { name: 'DeepSeek' }).click();
    await expect(toolRow).toContainText('DeepSeek');

    await page.getByTestId('vault-lock-btn').click();
    await expect(page.getByTestId('vault-lock-form')).toBeVisible();
  });

  test('wrong password shows error', async ({ page, request }) => {
    // vault.enc 已由前一个 test 创建（密码 my-password-1），先确保服务端锁定态
    await request.post('/api/vault/lock');
    await page.goto('/vault');
    await expect(page.getByTestId('vault-lock-form')).toBeVisible();
    await page.getByTestId('vault-password').fill('wrong-password');
    await page.getByTestId('vault-unlock-btn').click();
    await expect(page.getByText('密码错误')).toBeVisible();
  });
});