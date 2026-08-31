import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { dirSha256, isSkillDir, scanSkills, copyTree, atomicCopy } from '../checksum';

const tmp = path.join(os.tmpdir(), `aihome-checksum-test-${process.pid}`);

async function makeSkill(root: string, name: string, extra = 'content'): Promise<string> {
  if (path.basename(name) !== name) throw new Error(`invalid name: ${name}`);
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\ndescription: ${name}\n---\n\n${extra}\n`, 'utf-8');
  return dir;
}

beforeEach(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

describe('dirSha256', () => {
  it('is stable for identical trees and differs for content changes', async () => {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    await fs.mkdir(a, { recursive: true });
    await fs.mkdir(b, { recursive: true });
    await fs.writeFile(path.join(a, 'SKILL.md'), 'same', 'utf-8');
    await fs.writeFile(path.join(b, 'SKILL.md'), 'same', 'utf-8');
    expect(await dirSha256(a)).toBe(await dirSha256(b));
    await fs.writeFile(path.join(b, 'SKILL.md'), 'different', 'utf-8');
    expect(await dirSha256(a)).not.toBe(await dirSha256(b));
  });

  it('ignores hidden files and dirs', async () => {
    const a = path.join(tmp, 'a');
    await fs.mkdir(path.join(a, '.hidden'), { recursive: true });
    await fs.writeFile(path.join(a, '.hidden', 'x'), 'secret', 'utf-8');
    await fs.writeFile(path.join(a, 'SKILL.md'), 'same', 'utf-8');
    const b = path.join(tmp, 'b');
    await fs.mkdir(b, { recursive: true });
    await fs.writeFile(path.join(b, 'SKILL.md'), 'same', 'utf-8');
    expect(await dirSha256(a)).toBe(await dirSha256(b));
  });

  it('is deterministic for an empty dir', async () => {
    const a = path.join(tmp, 'empty-a');
    const b = path.join(tmp, 'empty-b');
    await fs.mkdir(a, { recursive: true });
    await fs.mkdir(b, { recursive: true });
    expect(await dirSha256(a)).toBe(await dirSha256(b));
  });
});

describe('isSkillDir / scanSkills', () => {
  it('detects skill dirs and rejects junk', async () => {
    const root = path.join(tmp, 'endpoint');
    await makeSkill(root, 'foo');
    await fs.mkdir(path.join(root, 'junk.zip'), { recursive: true });
    await fs.mkdir(path.join(root, 'plain'), { recursive: true });
    await fs.mkdir(path.join(root, '.hidden'), { recursive: true });
    await fs.writeFile(path.join(root, '.hidden', 'SKILL.md'), 'x', 'utf-8');

    expect(await isSkillDir(path.join(root, 'foo'))).toBe(true);
    expect(await isSkillDir(path.join(root, 'junk.zip'))).toBe(false);
    expect(await isSkillDir(path.join(root, 'plain'))).toBe(false);
    expect(await isSkillDir(path.join(root, '.hidden'))).toBe(false);

    const scanned = await scanSkills(root);
    expect(Object.keys(scanned)).toEqual(['foo']);
  });

  it('returns empty map for missing root', async () => {
    expect(await scanSkills(path.join(tmp, 'nope'))).toEqual({});
  });
});

describe('copyTree / atomicCopy', () => {
  it('copies tree skipping dotfiles', async () => {
    const src = path.join(tmp, 'src');
    await makeSkill(src, 'foo');
    await fs.writeFile(path.join(src, 'foo', '.secret'), 'x', 'utf-8');
    const dst = path.join(tmp, 'dst');
    await copyTree(src, dst);
    expect(await scanSkills(dst)).toEqual(await scanSkills(src));
    expect(await fs.readFile(path.join(dst, 'foo', 'SKILL.md'), 'utf-8')).toBe(
      await fs.readFile(path.join(src, 'foo', 'SKILL.md'), 'utf-8')
    );
  });

  it('atomicCopy replaces existing destination', async () => {
    const src = path.join(tmp, 'src2');
    await makeSkill(src, 'foo', 'v2');
    const dst = path.join(tmp, 'dst2');
    await makeSkill(tmp, 'dst2', 'v1');
    await atomicCopy(path.join(src, 'foo'), dst);
    expect(await fs.readFile(path.join(dst, 'SKILL.md'), 'utf-8')).toContain('v2');
  });
});
