import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, unlinkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Registry } from './registry';
import { syncSkills, getSkillsDir } from './sync-engine';
import { runDoctor } from './doctor';

let root: string;
let reg: Registry;
let platformDir: string;

function makeSkill(id: string) {
  if (path.basename(id) !== id) throw new Error(`invalid id: ${id}`);
  const dir = path.join(getSkillsDir(), id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), `# ${id}\n\nbody\n`);
  reg.addSkill({ name: id, description: 'd', source_dir: dir });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aihome-doctor-'));
  process.env.AIHOME_REGISTRY_DIR = root;
  platformDir = path.join(root, 'platform');
  mkdirSync(platformDir);
  reg = new Registry();
  reg.open();
  reg.registerPlatform('claude-code', platformDir);
  reg.setPlatformEnabled('claude-code', true);
  makeSkill('skill-a');
});

afterEach(() => {
  reg.close();
  delete process.env.AIHOME_REGISTRY_DIR;
  rmSync(root, { recursive: true, force: true });
});

describe('runDoctor', () => {
  it('reports nothing for healthy setup', () => {
    syncSkills(reg);
    expect(runDoctor(reg)).toHaveLength(0);
  });

  it('reports missing_link when link was deleted', () => {
    syncSkills(reg);
    unlinkSync(path.join(platformDir, 'skill-a'));
    expect(runDoctor(reg).some((i) => i.type === 'missing_link')).toBe(true);
  });

  it('reports real_directory when a real dir shadows the link', () => {
    syncSkills(reg);
    rmSync(path.join(platformDir, 'skill-a'), { recursive: true, force: true });
    mkdirSync(path.join(platformDir, 'skill-a'));
    expect(runDoctor(reg).some((i) => i.type === 'real_directory')).toBe(true);
  });

  it('reports wrong_target when link points elsewhere', () => {
    syncSkills(reg);
    rmSync(path.join(platformDir, 'skill-a'), { recursive: true, force: true });
    const other = path.join(root, 'other');
    mkdirSync(other);
    symlinkSync(other, path.join(platformDir, 'skill-a'), 'dir');
    expect(runDoctor(reg).some((i) => i.type === 'wrong_target')).toBe(true);
  });

  it('reports missing_canonical when registry skills dir gone', () => {
    syncSkills(reg);
    rmSync(getSkillsDir(), { recursive: true, force: true });
    expect(runDoctor(reg).some((i) => i.type === 'missing_canonical')).toBe(true);
  });

  it('fix repairs missing links', () => {
    syncSkills(reg);
    unlinkSync(path.join(platformDir, 'skill-a'));
    const issues = runDoctor(reg, { fix: true });
    expect(issues.find((i) => i.type === 'missing_link')?.fixed).toBe(true);
  });
});
