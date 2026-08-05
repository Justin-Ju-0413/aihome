import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { detectLegacyRepo, migrateLegacyRepo } from '../migration';
import { repoDir, commonDir } from '../paths';
import { scanSkills } from '../checksum';

// vitest v4 下 Node 内置模块 ESM 命名空间不可配置，vi.spyOn(os, 'homedir') 会抛错，
// 因此改为 vi.mock 包装 os 模块，测试内用 vi.mocked(os.homedir) 模拟旧仓库位置。
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: vi.fn(actual.homedir) };
});

const tmp = path.join(os.tmpdir(), `aihome-migration-test-${process.pid}`);
const OLD_REPO = process.env.AIHOME_REPO_DIR;
const OLD_CFG = process.env.AIHOME_CONFIG_DIR;

async function makeSkill(root: string, name: string, extra = 'content'): Promise<void> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\ndescription: ${name}\n---\n\n${extra}\n`, 'utf-8');
}

beforeEach(async () => {
  process.env.AIHOME_REPO_DIR = path.join(tmp, 'repo');
  process.env.AIHOME_CONFIG_DIR = path.join(tmp, 'config');
  await fs.mkdir(path.join(tmp, 'config'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  if (OLD_REPO === undefined) delete process.env.AIHOME_REPO_DIR; else process.env.AIHOME_REPO_DIR = OLD_REPO;
  if (OLD_CFG === undefined) delete process.env.AIHOME_CONFIG_DIR; else process.env.AIHOME_CONFIG_DIR = OLD_CFG;
});

describe('migration', () => {
  it('detects legacy repo at ~/skill-sync when present', async () => {
    const legacy = path.join(os.homedir(), 'skill-sync');
    const present = await fs.access(path.join(legacy, 'metadata.json')).then(() => true).catch(() => false);
    expect(await detectLegacyRepo()).toBe(present ? legacy : null);
  });

  it('migrates legacy common and metadata into repo dir', async () => {
    const legacy = path.join(tmp, 'skill-sync');
    await makeSkill(path.join(legacy, 'common'), 'foo');
    await makeSkill(path.join(legacy, 'common'), 'bar');
    await fs.writeFile(
      path.join(legacy, 'metadata.json'),
      JSON.stringify({ version: 1, skills: {} }),
      'utf-8'
    );
    await fs.writeFile(path.join(legacy, 'MANIFEST.md'), '# manifest', 'utf-8');
    vi.mocked(os.homedir).mockReturnValue(tmp);

    const result = await migrateLegacyRepo();
    expect(result).toEqual({ migrated: true, copiedSkills: 2, reason: 'ok' });
    expect(Object.keys(await scanSkills(commonDir()))).toEqual(['bar', 'foo']);
    const marker = await fs.readFile(path.join(repoDir(), '.migrated-from'), 'utf-8');
    expect(marker).toBe(legacy);
    vi.restoreAllMocks();
  });

  it('is idempotent: second call reports already-migrated', async () => {
    const legacy = path.join(tmp, 'skill-sync');
    await makeSkill(path.join(legacy, 'common'), 'foo');
    await fs.writeFile(
      path.join(legacy, 'metadata.json'),
      JSON.stringify({ version: 1, skills: {} }),
      'utf-8'
    );
    vi.mocked(os.homedir).mockReturnValue(tmp);

    await migrateLegacyRepo();
    const second = await migrateLegacyRepo();
    expect(second).toEqual({ migrated: false, copiedSkills: 0, reason: 'already-migrated' });
    vi.restoreAllMocks();
  });

  it('reports no-legacy when absent', async () => {
    vi.mocked(os.homedir).mockReturnValue(tmp);
    const result = await migrateLegacyRepo();
    expect(result).toEqual({ migrated: false, copiedSkills: 0, reason: 'no-legacy' });
    vi.restoreAllMocks();
  });
});
