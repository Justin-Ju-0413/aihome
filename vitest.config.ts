import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts', 'src/components/**/*.test.tsx'],
    setupFiles: ['src/lib/__tests__/setup-act.ts'],
    // workbench 加密主密钥（测试不触 Keychain；生产用 Keychain/env）
    env: {
      AIHOME_WORKBENCH_ENC_KEY: 'test-master-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
