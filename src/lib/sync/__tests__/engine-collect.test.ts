import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { collect } from '../engine';
import { loadMetadata, saveMetadata } from '../metadata';
import { commonDir, metadataFile } from '../paths';
import { scanSkills, dirSha256 } from '../checksum';

const tmp = path.join(os.tmpdir(), `aihome-collect-test-${process.pid}`);
const endpoints = { alpha: path.join(tmp, 'alpha'), beta: path.join(tmp, 'beta') };
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
  await fs.mkdir(endpoints.alpha, { recursive: true });
  await fs.mkdir(endpoints.beta, { recursive: true });
  await fs.mkdir(path.join(tmp, 'config'), { recursive: true });
  await fs.writeFile(
    path.join(tmp, 'config', 'sync-config.json'),
    JSON.stringify({ version: 1, endpoints }),
    'utf-8'
  );
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  if (OLD_REPO === undefined) delete process.env.AIHOME_REPO_DIR; else process.env.AIHOME_REPO_DIR = OLD_REPO;
  if (OLD_CFG === undefined) delete process.env.AIHOME_CONFIG_DIR; else process.env.AIHOME_CONFIG_DIR = OLD_CFG;
});

describe('collect', () => {
  it('collects new skills and records sources', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    const result = await collect();
    expect(result.stats).toMatchObject({ new: 1, updated: 0, conflict: 0, skipped: 0 });
    expect(await scanSkills(commonDir())).toHaveProperty('foo');
    const meta = await loadMetadata(metadataFile());
    expect(meta.skills.foo.sources).toContain('alpha');
  });

  it('detects same-name conflicts and keeps name@endpoint copies', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await makeSkill(endpoints.beta, 'foo', 'v2-different');
    await makeSkill(endpoints.beta, 'bar', 'unique');
    const result = await collect();
    expect(result.stats).toMatchObject({ new: 2, conflict: 1, skipped: 0 });
    expect(await scanSkills(commonDir())).toHaveProperty('foo');
    expect(await scanSkills(commonDir())).toHaveProperty('foo@beta');
    expect(await scanSkills(commonDir())).toHaveProperty('bar');
    const meta = await loadMetadata(metadataFile());
    expect(meta.skills.foo.conflicts).toEqual({ beta: await dirSha256(path.join(endpoints.beta, 'foo')) });
  });

  it('ignores junk: zip, no SKILL.md, hidden dirs', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    await fs.mkdir(path.join(endpoints.alpha, 'junk.zip'), { recursive: true });
    await fs.mkdir(path.join(endpoints.alpha, 'plain'), { recursive: true });
    await fs.mkdir(path.join(endpoints.alpha, '.hidden'), { recursive: true });
    await fs.writeFile(path.join(endpoints.alpha, '.hidden', 'SKILL.md'), 'x', 'utf-8');
    await collect();
    const names = Object.keys(await scanSkills(commonDir()));
    expect(names).toEqual(['foo']);
  });

  it('dry run writes nothing', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    const result = await collect([], true);
    expect(result.stats).toMatchObject({ new: 1 });
    expect(await scanSkills(commonDir())).toEqual({});
    await expect(fs.access(commonDir())).rejects.toThrow(); // dryRun 不创建任何目录
  });

  it('skips unchanged skills on second run (idempotent)', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    await collect();
    const result = await collect();
    expect(result.stats).toMatchObject({ new: 0, conflict: 0, skipped: 1 });
  });

  it('updates metadata when collected skill already exists identical', async () => {
    await makeSkill(endpoints.alpha, 'foo');
    await collect();
    const meta = await loadMetadata(metadataFile());
    meta.skills.foo.sources = [];
    await saveMetadata(meta, metadataFile());
    await collect();
    const after = await loadMetadata(metadataFile());
    expect(after.skills.foo.sources).toContain('alpha');
  });

  it('rejects unknown endpoint names', async () => {
    await expect(collect(['nope'])).rejects.toThrow('未知端名');
  });

  it('warns when endpoint path missing', async () => {
    await fs.rm(endpoints.beta, { recursive: true, force: true });
    const result = await collect();
    expect(result.warnings.some((w) => w.includes('beta'))).toBe(true);
  });
});
