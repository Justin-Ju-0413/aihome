import { test, expect } from '@playwright/test';

test.describe('Skill Sync', () => {
  test('isolation guard: dev server must use .e2e-sync dirs', async ({ request }) => {
    const res = await request.get('/api/sync/status');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const alphaPath: string = data.state.endpoints.alpha?.path ?? '';
    expect(alphaPath).toContain('.e2e-sync');
  });

  test('sync page shows endpoint status', async ({ page }) => {
    await page.goto('/sync');
    await expect(page.locator('main h1')).toContainText('Skill Sync');
    await expect(page.locator('main section').filter({ hasText: 'alpha' }).first()).toBeVisible();
    await expect(page.locator('main section').filter({ hasText: 'beta' }).first()).toBeVisible();
  });

  test('collect pulls skills and records the conflict', async ({ page, request }) => {
    await page.goto('/sync');
    await page.locator('button', { hasText: 'collect' }).click();
    await expect(page.locator('text=冲突').first()).toBeVisible();

    const conflicts = await (await request.get('/api/sync/conflicts')).json();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].name).toBe('foo');
    expect(conflicts[0].versions).toContain('common/foo@beta');

    const status = await (await request.get('/api/sync/status')).json();
    expect(status.state.summary.total_skills).toBe(2);
    expect(status.state.summary.conflict_count).toBe(1);
  });

  test('push installs non-conflicting skills, keeps conflict copies', async ({ page, request }) => {
    await page.goto('/sync');
    await page.locator('button', { hasText: 'push' }).click();

    // push 为异步请求：等待 bar 落到 alpha 后（alpha 初始仅 foo）再断言，
    // 避免与进行中的 push 请求产生竞态
    await expect
      .poll(
        async () => {
          const res = await request.get('/api/sync/status');
          const data = await res.json();
          return data.state.endpoints.alpha?.diff?.same ?? 0;
        },
        { timeout: 15_000, message: 'push 应把 bar 装到 alpha' }
      )
      .toBe(2);

    const status = await (await request.get('/api/sync/status')).json();
    // bar（无冲突）应已装到 alpha/beta；foo（冲突标记）不动
    expect(status.state.endpoints.beta.diff.same).toBe(1);      // bar
    expect(status.state.endpoints.beta.diff.different).toBe(1); // foo 冲突副本保留
    expect(status.state.endpoints.alpha.diff.same).toBe(2);     // foo + bar
    expect(status.state.endpoints.alpha.diff.missing).toBe(0);
  });
});
