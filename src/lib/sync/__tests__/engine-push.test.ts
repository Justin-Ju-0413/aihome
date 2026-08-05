import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { collect, push } from '../engine';
import { scanSkills } from '../checksum';

const tmp = path.join(os.tmpdir(), `aihome-push-test-${process.pid}`);
const endpoints = {
  alpha: path.join(tmp, 'alpha'),
  beta: path.join(tmp, 'beta'),
  gamma: path.join(tmp, 'gamma'),
};
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

describe('push', () => {
  it('installs non-conflicting skills to a fresh endpoint and is idempotent', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await makeSkill(endpoints.beta, 'foo', 'v2-different');
    await makeSkill(endpoints.beta, 'bar', 'unique');
    await collect();

    const result = await push();
    expect(result.stats.updated).toBeGreaterThan(0);
    expect(await scanSkills(endpoints.gamma)).toHaveProperty('bar');
    const bar = await fs.readFile(path.join(endpoints.gamma, 'bar', 'SKILL.md'), 'utf-8');
    expect(bar).toContain('unique');

    const before = await scanSkills(endpoints.gamma);
    await push();
    expect(await scanSkills(endpoints.gamma)).toEqual(before);
  });

  it('does not overwrite conflicted skill copies anywhere', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await makeSkill(endpoints.beta, 'foo', 'v2-different');
    await collect();
    await push();
    expect(await fs.readFile(path.join(endpoints.beta, 'foo', 'SKILL.md'), 'utf-8')).toContain('v2-different');
    expect(await fs.readFile(path.join(endpoints.alpha, 'foo', 'SKILL.md'), 'utf-8')).toContain('v1');
    expect(await scanSkills(endpoints.gamma)).not.toHaveProperty('foo');
  });

  it('warns before overwriting a diverged endpoint copy', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await collect();
    await fs.writeFile(path.join(endpoints.alpha, 'foo', 'SKILL.md'), 'local edit', 'utf-8');
    const result = await push(['alpha']);
    expect(result.warnings.some((w) => w.includes('alpha:foo'))).toBe(true);
    expect(await fs.readFile(path.join(endpoints.alpha, 'foo', 'SKILL.md'), 'utf-8')).toContain('v1');
  });

  it('dry run does not touch endpoints', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await collect();
    await fs.rm(endpoints.gamma, { recursive: true, force: true });
    const result = await push([], true);
    expect(result.stats.updated).toBeGreaterThan(0);
    await expect(fs.access(endpoints.gamma)).rejects.toThrow(); // dryRun 不创建端目录
  });

  it('rejects unknown endpoint names', async () => {
    await expect(push(['nope'])).rejects.toThrow('未知端名');
  });
});
