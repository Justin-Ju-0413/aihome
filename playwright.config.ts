import * as path from 'path';
import { defineConfig, devices } from '@playwright/test';

const e2eSyncRoot = path.join(__dirname, 'e2e', '.e2e-sync');
// 默认 3011：3000 常被其他项目占用（travel-planner 等），Tauri 壳用 3010
const port = process.env.PORT ?? '3011';
const baseURL = `http://localhost:${port}`;
const mockBalanceURL = 'http://127.0.0.1:3210';

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // workbench 余额查询 mock（不触网）
      command: `node e2e/mock-balance-server.mjs`,
      url: mockBalanceURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: process.env.CI ? `npm run start -- -p ${port}` : `npm run dev -- -p ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        AIHOME_REPO_DIR: path.join(e2eSyncRoot, 'repo'),
        AIHOME_CONFIG_DIR: path.join(e2eSyncRoot, 'config'),
        AIHOME_LEGACY_DIR: path.join(e2eSyncRoot, 'legacy'),
        AIHOME_USAGE_CCSWITCH_DB: path.join(e2eSyncRoot, '..', '.e2e-usage', 'cc-switch.db'),
        AIHOME_USAGE_CLAUDE_DIR: path.join(e2eSyncRoot, '..', '.e2e-usage', 'claude-projects'),
        AIHOME_USAGE_CODEX_DIR: path.join(e2eSyncRoot, '..', '.e2e-usage', 'codex-sessions'),
        AIHOME_USAGE_OPENCODE_DB: path.join(e2eSyncRoot, '..', '.e2e-usage', 'opencode.db'),
        AIHOME_USAGE_HERMES_DB: path.join(e2eSyncRoot, '..', '.e2e-usage', 'hermes.db'),
        AIHOME_USAGE_OPENCLAW_DIR: path.join(e2eSyncRoot, '..', '.e2e-usage', 'openclaw-agents'),
        AIHOME_USAGE_ZCODE_DIR: path.join(e2eSyncRoot, '..', '.e2e-usage', 'zcode-rollout'),
        AIHOME_USAGE_DSH_STORE: path.join(e2eSyncRoot, '..', '.e2e-usage', 'dsh', 'storages', 'session_projcache.json'),
        AIHOME_USAGE_CACHE: path.join(e2eSyncRoot, '..', '.e2e-usage', 'cache.db'),
        AIHOME_WORKBENCH_DB: path.join(e2eSyncRoot, '..', '.e2e-workbench', 'workbench.db'),
        AIHOME_WORKBENCH_DEEPSEEK_BASE_URL: mockBalanceURL,
        AIHOME_WORKBENCH_OPENROUTER_BASE_URL: `${mockBalanceURL}/api/v1`,
        AIHOME_WORKBENCH_OPENAI_BASE_URL: mockBalanceURL,
        // e2e 用固定测试密钥，不触碰 macOS Keychain
        AIHOME_WORKBENCH_ENC_KEY: 'e2e-master-key',
        AIHOME_REGISTRY_DIR: path.join(e2eSyncRoot, 'registry'),
        AIHOME_VAULT_FILE: path.join(e2eSyncRoot, 'vault', 'vault.enc'),
        AIHOME_VAULT_CLAUDE_CODE_CONFIG: path.join(e2eSyncRoot, 'vault', 'settings.json'),
        AIHOME_VAULT_CODEX_CONFIG: path.join(e2eSyncRoot, 'vault', 'config.toml'),
        AIHOME_VAULT_CODEX_AUTH: path.join(e2eSyncRoot, 'vault', 'auth.json'),
        AIHOME_VAULT_OPENCODE_CONFIG: path.join(e2eSyncRoot, 'vault', 'opencode.json'),
        AIHOME_VAULT_BACKUP_DIR: path.join(e2eSyncRoot, 'vault', 'backups'),
      },
    },
  ],
});
