import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Registry } from './registry';

let dir: string;
let reg: Registry;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'aihome-reg-'));
  process.env.AIHOME_REGISTRY_DIR = dir;
  reg = new Registry();
  reg.open();
});

afterEach(() => {
  reg.close();
  delete process.env.AIHOME_REGISTRY_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('Registry', () => {
  it('creates schema on first open (user_version=1)', () => {
    expect(reg.version()).toBe(1);
  });

  it('adds and lists skills', () => {
    const id = reg.addSkill({ name: 'doc-writer', description: 'writes docs', source_dir: path.join(dir, 'skills', 'doc-writer') });
    expect(id).toBe('doc-writer');
    const skills = reg.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('doc-writer');
  });

  it('tracks sync state per skill+platform', () => {
    const id = reg.addSkill({ name: 'a', description: '', source_dir: path.join(dir, 'skills', 'a') });
    reg.setSyncState(id, 'claude-code', 'linked');
    expect(reg.getSyncState(id, 'claude-code')?.status).toBe('linked');
    expect(reg.getSyncState(id, 'codex')).toBeNull();
  });

  it('registers and enables platforms', () => {
    reg.registerPlatform('codex', '/tmp/codex-skills');
    reg.setPlatformEnabled('codex', true);
    expect(reg.listPlatforms().find((p) => p.name === 'codex')?.enabled).toBe(1);
  });

  it('deletes skills and cascades sync state', () => {
    const id = reg.addSkill({ name: 'a', description: '', source_dir: path.join(dir, 'skills', 'a') });
    reg.setSyncState(id, 'claude-code', 'linked');
    reg.deleteSkill(id);
    expect(reg.listSkills()).toHaveLength(0);
    expect(reg.getSyncState(id, 'claude-code')).toBeNull();
  });

  it('disambiguates slug collisions instead of overwriting', () => {
    const id1 = reg.addSkill({ name: 'My-Skill', description: 'one', source_dir: path.join(dir, 's1') });
    const id2 = reg.addSkill({ name: 'MY SKILL', description: 'two', source_dir: path.join(dir, 's2') });
    expect(id1).toBe('my-skill');
    expect(id2).toBe('my-skill-2');
    const skills = reg.listSkills();
    expect(skills).toHaveLength(2);
    expect(skills.find((s) => s.id === id2)?.name).toBe('MY SKILL');
    expect(skills.find((s) => s.id === id1)?.description).toBe('one');
  });

  it('keeps reinstall idempotent for the same name', () => {
    const id1 = reg.addSkill({ name: 'doc-writer', description: 'v1', source_dir: 'x' });
    const id2 = reg.addSkill({ name: 'doc-writer', description: 'v2', source_dir: 'y' });
    expect(id1).toBe('doc-writer');
    expect(id2).toBe(id1);
    expect(reg.listSkills()).toHaveLength(1);
    expect(reg.listSkills()[0].description).toBe('v2');
  });

  it('reopens existing db without migration errors', () => {
    reg.close();
    reg.open();
    expect(reg.version()).toBe(1);
  });
});
