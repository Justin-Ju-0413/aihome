import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { collect, buildState } from '../engine';

const tmp = path.join(os.tmpdir(), `aihome-state-test-${process.pid}`);
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

describe('buildState', () => {
  it('classifies endpoint diffs missing/same/different/extra', async () => {
    await makeSkill(endpoints.alpha, 'foo', 'v1');
    await makeSkill(endpoints.beta, 'foo', 'v2');
    await collect();

    const state = await buildState();
    expect(state.summary.total_skills).toBe(1);
    expect(state.summary.conflict_count).toBe(1);
    expect(state.summary.endpoint_count).toBe(2);

    const alpha = state.endpoints.alpha;
    const beta = state.endpoints.beta;
    expect(alpha.diff.same).toBe(1);
    expect(beta.diff.different).toBe(1);
    expect(alpha.diff.missing).toBe(0);

    const foo = state.skills.find((s) => s.name === 'foo');
    expect(foo?.endpoint_state.alpha).toBe('same');
    expect(foo?.endpoint_state.beta).toBe('different');
    expect(foo?.conflicts.beta).toBeTruthy();
  });

  it('reports extra skills and missing endpoints', async () => {
    await makeSkill(endpoints.alpha, 'only-here');
    await fs.rm(endpoints.beta, { recursive: true, force: true });
    const state = await buildState();
    expect(state.endpoints.alpha.diff.extra).toBe(1);
    expect(state.endpoints.beta.exists).toBe(false);
    expect(state.endpoints.beta.count).toBe(0);
  });
});
