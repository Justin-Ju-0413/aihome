import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { emptyMetadata, loadMetadata, saveMetadata, compareSkills, renderManifest, SkillMetaEntry } from '../metadata';

const tmp = path.join(os.tmpdir(), `aihome-meta-test-${process.pid}`);

beforeEach(async () => { await fs.mkdir(tmp, { recursive: true }); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

function entry(sha: string, extra: Partial<SkillMetaEntry> = {}): SkillMetaEntry {
  return { sha256: sha, sources: ['alpha'], updated_at: '2026-01-01T00:00:00+00:00', ...extra };
}

describe('load/save', () => {
  it('round-trips metadata', async () => {
    const meta = emptyMetadata();
    meta.skills.foo = entry('abc');
    const file = path.join(tmp, 'metadata.json');
    await saveMetadata(meta, file);
    expect(await loadMetadata(file)).toEqual(meta);
  });

  it('falls back to empty on missing or corrupt', async () => {
    expect(await loadMetadata(path.join(tmp, 'nope.json'))).toEqual(emptyMetadata());
    await fs.writeFile(path.join(tmp, 'bad.json'), '{oops', 'utf-8');
    expect(await loadMetadata(path.join(tmp, 'bad.json'))).toEqual(emptyMetadata());
  });
});

describe('compareSkills', () => {
  it('classifies new/same/changed/conflict', () => {
    const skills: Record<string, SkillMetaEntry> = {
      same: entry('sha-same'),
      changed: entry('sha-old'),
      conflict: entry('sha-c', { conflicts: { beta: 'sha-b' } }),
    };
    const remote = { same: 'sha-same', changed: 'sha-new', conflict: 'sha-c', fresh: 'sha-fresh' };
    const diff = compareSkills(remote, skills);
    expect(diff.new).toEqual([['fresh', 'sha-fresh']]);
    expect(diff.same).toEqual([['same', 'sha-same']]);
    expect(diff.changed).toEqual([['changed', 'sha-new']]);
    expect(diff.conflict).toEqual([['conflict', 'sha-c']]);
  });
});

describe('renderManifest', () => {
  it('renders rows with sha8 and conflicts', () => {
    const meta = emptyMetadata();
    meta.skills.foo = entry('abcdef1234567890');
    meta.skills.bar = entry('deadbeef00000000', { conflicts: { beta: 'x' } });
    const text = renderManifest(meta);
    expect(text).toContain('| foo | abcdef12 | alpha | - |');
    expect(text).toContain('| bar | deadbeef | alpha | beta |');
    expect(text).toContain('技能总数: 2 | 冲突: 1');
  });
});
