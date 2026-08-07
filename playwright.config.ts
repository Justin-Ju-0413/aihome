import * as path from 'path';
import { defineConfig, devices } from '@playwright/test';

const e2eSyncRoot = path.join(__dirname, 'e2e', '.e2e-sync');

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
    baseURL: 'http://localhost:3000',
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

  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
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
      AIHOME_USAGE_CACHE: path.join(e2eSyncRoot, '..', '.e2e-usage', 'cache.db'),
    },
  },
});
