import { test, expect } from '@playwright/test';

// /agents 默认展示 AI 工具分区（本机 AI 工具检测）。
// e2e 环境下 .app 路径已重定向到不存在的沙箱路径；CLI 二进制可能命中宿主机安装，
// 因此只断言结构与状态徽章存在，不依赖具体安装状态。

const TOOL_IDS = ['claude-code', 'codex', 'opencode', 'claude-desktop', 'chatgpt-desktop'];

test.describe('Agents Tools Section', () => {
  test('tools section is the default tab with all catalog cards', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.getByTestId('agents-tab-tools')).toBeVisible();

    const cards = page.getByTestId('tools-card');
    await expect(cards).toHaveCount(TOOL_IDS.length);
    for (const id of TOOL_IDS) {
      await expect(page.locator(`[data-tool-id="${id}"]`)).toBeVisible();
    }
  });

  test('every card shows an install status badge', async ({ page }) => {
    await page.goto('/agents');
    const cards = page.getByTestId('tools-card');
    await expect(cards).toHaveCount(5);

    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const badge = cards.nth(i).locator('span', { hasText: /^Installed|Not installed$/ });
      await expect(badge).toHaveCount(1);
    }
  });

  test('open action availability follows install/vault-link status', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.getByTestId('tools-card')).toHaveCount(5);

    // vault 接入的 CLI 恒有打开入口（未安装时禁用）
    for (const id of ['claude-code', 'codex', 'opencode']) {
      await expect(page.getByTestId(`tools-open-${id}`)).toHaveCount(1);
    }
    // e2e 沙箱里 .app 路径不存在：未安装且未接入 vault 的卡不渲染打开按钮
    await expect(page.getByTestId('tools-open-chatgpt-desktop')).toHaveCount(0);
    await expect(page.getByTestId('tools-open-claude-desktop')).toHaveCount(0);
  });

  test('can switch to markdown agents tab and back', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.getByTestId('tools-card').first()).toBeVisible();

    await page.getByTestId('agents-tab-markdown').click();
    // markdown 分区控制条出现
    await expect(page.getByTestId('agents-fulltext')).toBeVisible();
    await expect(page.getByTestId('tools-card')).toHaveCount(0);

    await page.getByTestId('agents-tab-tools').click();
    await expect(page.getByTestId('tools-card').first()).toBeVisible();
  });

  test('redetect control is present in tools section', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.getByTestId('tools-redetect')).toBeVisible();
    await expect(page.getByTestId('tools-redetect')).toBeEnabled();
  });
});
