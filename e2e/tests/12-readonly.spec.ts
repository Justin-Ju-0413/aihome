import { test, expect } from '../fixtures/test-data.fixture';
import * as fs from 'fs';
import * as path from 'path';

// 与 playwright.config.ts 的 AIHOME_CONFIG_DIR 同路径（e2e worker 看不到 webServer env）
const CONFIG_PATH = path.join(__dirname, '..', '.e2e-sync', 'config', 'config.json');

test.describe('Read-only demo mode', () => {
  let original: string | null = null;

  test.beforeEach(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      original = fs.readFileSync(CONFIG_PATH, 'utf-8');
    } else {
      original = null;
    }
    // 打开只读模式（保留原配置其余字段）
    const base = original ? JSON.parse(original) : { name: 'AIHome', paths: [], groups: [] };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...base, readonly: true }, null, 2));
  });

  test.afterEach(() => {
    if (original === null) {
      fs.rmSync(CONFIG_PATH, { force: true });
    } else {
      fs.writeFileSync(CONFIG_PATH, original);
    }
  });

  test('write APIs return 403 while GET stays available', async ({ request }) => {
    const create = await request.post('/api/agents', {
      data: { type: 'agent', name: 'Readonly Agent', description: 'x' },
    });
    expect(create.status()).toBe(403);

    const get = await request.get('/api/agents');
    expect(get.status()).toBe(200);
  });

  test('registry write API is blocked too', async ({ request }) => {
    const sync = await request.post('/api/registry/sync', { data: {} });
    expect(sync.status()).toBe(403);
  });

  test('settings page shows read-only banner and disables save', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('readonly-banner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('settings-save-btn')).toBeDisabled();
  });
});
