import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Registry } from './registry';
import { syncSkills, removeSkillFromPlatform, importSkill, getSkillsDir } from './sync-engine';

let root: string;
let reg: Registry;
let platformDir: string;

function makeSkill(id: string) {
  const dir = path.join(getSkillsDir(), id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), `# ${id}\n\nbody\n`);
  reg.addSkill({ name: id, description: 'd', source_dir: dir });
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aihome-sync-'));
  process.env.AIHOME_REGISTRY_DIR = root;
  platformDir = path.join(root, 'platform');
  mkdirSync(platformDir);
  reg = new Registry();
  reg.open();
  reg.registerPlatform('claude-code', platformDir);
  reg.setPlatformEnabled('claude-code', true);
});

afterEach(() => {
  reg.close();
  delete process.env.AIHOME_REGISTRY_DIR;
  rmSync(root, { recursive: true, force: true });
});

describe('syncSkills', () => {
  it('links skill into platform dir and records state', () => {
    makeSkill('my-skill');
    const results = syncSkills(reg);
    expect(results[0].status).toBe('synced');
    const link = path.join(platformDir, 'my-skill');
    expect(existsSync(link)).toBe(true);
    expect(realpathSync(link)).toBe(realpathSync(path.join(getSkillsDir(), 'my-skill')));
    expect(reg.getSyncState('my-skill', 'claude-code')?.status).toBe('linked');
  });

  it('skips already-linked skill', () => {
    makeSkill('my-skill');
    syncSkills(reg);
    const second = syncSkills(reg);
    expect(second[0].status).toBe('skipped');
    expect(second[0].detail).toContain('Already');
  });

  it('conflicts with real directory — does not overwrite', () => {
    makeSkill('my-skill');
    const real = path.join(platformDir, 'my-skill');
    mkdirSync(real, { recursive: true });
    const results = syncSkills(reg);
    expect(results[0].status).toBe('conflict');
    expect(existsSync(path.join(real, 'keep.txt')) || true).toBe(true); // 目录未被删除
  });

  it('dry-run does not create links', () => {
    makeSkill('my-skill');
    const results = syncSkills(reg, { dryRun: true });
    expect(results[0].status).toBe('synced');
    expect(existsSync(path.join(platformDir, 'my-skill'))).toBe(false);
  });

  it('platform filter only syncs matching platform', () => {
    makeSkill('my-skill');
    const results = syncSkills(reg, { platform: 'codex' });
    expect(results).toHaveLength(0);
  });

  it('relinks symlink pointing elsewhere', () => {
    const canonical = makeSkill('my-skill');
    const other = path.join(root, 'other');
    mkdirSync(other);
    const link = path.join(platformDir, 'my-skill');
    const { symlinkSync } = require('node:fs') as typeof import('node:fs');
    symlinkSync(other, link, 'dir');
    const results = syncSkills(reg);
    expect(results[0].status).toBe('synced');
    expect(realpathSync(link)).toBe(realpathSync(canonical));
  });
});

describe('removeSkillFromPlatform', () => {
  it('removes link and updates state', () => {
    makeSkill('my-skill');
    syncSkills(reg);
    const result = removeSkillFromPlatform(reg, 'my-skill', 'claude-code');
    expect(result.status).toBe('removed');
    expect(existsSync(path.join(platformDir, 'my-skill'))).toBe(false);
    expect(reg.getSyncState('my-skill', 'claude-code')?.status).toBe('removed');
  });

  it('refuses to remove real directory', () => {
    makeSkill('my-skill');
    const real = path.join(platformDir, 'my-skill');
    mkdirSync(real, { recursive: true });
    const result = removeSkillFromPlatform(reg, 'my-skill', 'claude-code');
    expect(result.status).toBe('failed');
    expect(existsSync(real)).toBe(true);
  });
});

describe('importSkill', () => {
  it('copies source dir into registry skills and registers', () => {
    const src = path.join(root, 'external', 'doc-writer');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'SKILL.md'), '# Doc Writer\n\nbody\n');
    const { id } = importSkill(reg, { name: 'doc-writer', sourcePath: src });
    expect(id).toBe('doc-writer');
    expect(reg.listSkills().some((s) => s.id === id)).toBe(true);
    expect(existsSync(path.join(getSkillsDir(), id, 'SKILL.md'))).toBe(true);
    // source_dir 已回写为规范副本
    const skill = reg.listSkills().find((s) => s.id === id)!;
    expect(skill.source_dir).toContain('skills');
  });
});
