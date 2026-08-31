import { test as base } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
// app 实际读取的配置目录：playwright webServer 设了 AIHOME_CONFIG_DIR（.e2e-sync/config），
// 但该 env 只对 server 进程生效、测试 worker 看不到——fixture 直接管理同一个确定性路径，
// 否则 paths 隔离（只扫 data/test-agents）失效，会扫到真实 data/sample-agents。
// 手动起 server 复用时 .e2e-sync 不存在，回退 .aihome（app 此时读的就是它）。
const E2E_CONFIG_DIR = path.join(PROJECT_ROOT, 'e2e', '.e2e-sync', 'config');
const CONFIG_DIR = fs.existsSync(E2E_CONFIG_DIR) ? E2E_CONFIG_DIR : path.join(PROJECT_ROOT, '.aihome');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const TEST_DATA_DIR = path.join(PROJECT_ROOT, 'data', 'test-agents');
const BACKUP_CONFIG_PATH = path.join(CONFIG_DIR, 'config.json.e2e-backup');

// The app falls back to these defaults at runtime but never writes config.json
// to disk, so the fixture materializes it when absent (e.g. on a fresh clone).
const DEFAULT_CONFIG = {
  name: 'AIHome',
  paths: [path.join(PROJECT_ROOT, 'data')],
  groups: [
    { id: 'default', name: 'Default', color: '#6366f1', description: 'Default group' },
    { id: 'agents', name: 'Agents', color: '#10b981', description: 'Agent definitions' },
    { id: 'skills', name: 'Skills', color: '#f59e0b', description: 'Skill definitions' },
  ],
  layout: {},
};

export class TestDataManager {
  constructor(private testDataDir: string) {}

  createAgent(name: string, type: 'agent' | 'skill', description = '') {
    const dirName = name.toLowerCase().replace(/\s+/g, '-');
    const agentDir = path.join(this.testDataDir, dirName);
    fs.mkdirSync(agentDir, { recursive: true });

    if (type === 'skill') {
      const content = `---\nname: ${dirName}\ndescription: ${description}\nmetadata:\n  author: test\n---\n\n# ${name}\n\n${description}\n`;
      fs.writeFileSync(path.join(agentDir, 'SKILL.md'), content);
    } else {
      const content = `# ${name}\n\n${description}\n`;
      fs.writeFileSync(path.join(agentDir, 'AGENTS.md'), content);
    }

    return { name, type, dirPath: agentDir };
  }

  removeAgent(name: string) {
    const dirName = name.toLowerCase().replace(/\s+/g, '-');
    if (path.basename(dirName) !== dirName) throw new Error(`invalid dirName: ${dirName}`);
    const agentDir = path.resolve(this.testDataDir, dirName);
    if (!agentDir.startsWith(path.resolve(this.testDataDir) + path.sep)) throw new Error('dir escapes test data dir');
    if (fs.existsSync(agentDir)) {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  }

  cleanup() {
    if (fs.existsSync(this.testDataDir)) {
      fs.rmSync(this.testDataDir, { recursive: true, force: true });
    }
  }
}

export const test = base.extend<{ testData: TestDataManager }>({
  testData: async ({}, use) => {
    // SETUP: Ensure config exists on disk, back it up, and create test data directory
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
    fs.copyFileSync(CONFIG_PATH, BACKUP_CONFIG_PATH);
    const originalConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    const testConfig = {
      ...originalConfig,
      paths: [TEST_DATA_DIR],
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(testConfig, null, 2));

    const manager = new TestDataManager(TEST_DATA_DIR);

    await use(manager);

    // TEARDOWN: Restore config and cleanup test data
    fs.copyFileSync(BACKUP_CONFIG_PATH, CONFIG_PATH);
    fs.unlinkSync(BACKUP_CONFIG_PATH);
    manager.cleanup();
  },
});

export { expect } from '@playwright/test';
