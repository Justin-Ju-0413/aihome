import { test as base } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.aihome', 'config.json');
const TEST_DATA_DIR = path.join(PROJECT_ROOT, 'data', 'test-agents');
const BACKUP_CONFIG_PATH = path.join(PROJECT_ROOT, '.aihome', 'config.json.e2e-backup');

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
    // SETUP: Ensure config exists on disk, back it up, and create test data directory
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
