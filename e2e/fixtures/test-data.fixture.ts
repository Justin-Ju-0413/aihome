import { test as base, type Page, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.aihome', 'config.json');
const TEST_DATA_DIR = path.join(PROJECT_ROOT, 'data', 'test-agents');
const BACKUP_CONFIG_PATH = path.join(PROJECT_ROOT, '.aihome', 'config.json.e2e-backup');

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
    const agentDir = path.join(this.testDataDir, dirName);
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
    // SETUP: Backup config and create test data directory
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
