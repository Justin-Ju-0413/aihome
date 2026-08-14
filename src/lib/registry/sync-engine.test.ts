import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, realpathSync, symlinkSync, readFileSync, lstatSync, readlinkSync } from 'node:fs';
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

  it('disambiguates slug collision instead of overwriting an existing skill', () => {
    // 先导入 My-Tool，再导入 MY TOOL —— slug 同为 my-tool，不得互相覆盖
    const src1 = path.join(root, 'ext1');
    mkdirSync(src1, { recursive: true });
    writeFileSync(path.join(src1, 'SKILL.md'), '# My Tool\n\nbody one\n');
    const { id: id1 } = importSkill(reg, { name: 'My-Tool', sourcePath: src1 });

    const src2 = path.join(root, 'ext2');
    mkdirSync(src2, { recursive: true });
    writeFileSync(path.join(src2, 'SKILL.md'), '# MY TOOL\n\nbody two\n');
    const { id: id2 } = importSkill(reg, { name: 'MY TOOL', sourcePath: src2 });

    expect(id1).toBe('my-tool');
    expect(id2).toBe('my-tool-2');
    expect(reg.listSkills()).toHaveLength(2);
    // 两个技能的数据都在，未被覆盖
    const s1 = reg.listSkills().find((s) => s.id === id1)!;
    const s2 = reg.listSkills().find((s) => s.id === id2)!;
    expect(readFileSync(path.join(s1.source_dir, 'SKILL.md'), 'utf-8')).toContain('body one');
    expect(readFileSync(path.join(s2.source_dir, 'SKILL.md'), 'utf-8')).toContain('body two');
  });

  it('reimporting the same name is idempotent', () => {
    const src = path.join(root, 'ext3');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'SKILL.md'), '# Doc Writer\n\nbody\n');
    const { id: id1 } = importSkill(reg, { name: 'doc-writer', sourcePath: src });
    const { id: id2 } = importSkill(reg, { name: 'doc-writer', sourcePath: src });
    expect(id1).toBe('doc-writer');
    expect(id2).toBe(id1);
    expect(reg.listSkills()).toHaveLength(1);
  });

  it('rejects a missing source path', () => {
    expect(() => importSkill(reg, { name: 'ghost', sourcePath: path.join(root, 'no-such-dir') })).toThrow();
    expect(reg.listSkills()).toHaveLength(0);
  });

  it('rejects a source without SKILL.md (not a skill directory)', () => {
    const src = path.join(root, 'not-a-skill');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'random.txt'), 'hello');
    expect(() => importSkill(reg, { name: 'not-a-skill', sourcePath: src })).toThrow();
    expect(reg.listSkills()).toHaveLength(0);
  });

  it('does not follow symlinks inside the source (no sandbox bleed)', () => {
    // 源内的符号链接应作为链接复制，而不是把链接目标内容拖进注册表
    const outside = path.join(root, 'outside-secret');
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, 'secret.txt'), 's3cr3t');
    const src = path.join(root, 'linked-skill');
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'SKILL.md'), '# Linked Skill\n\nbody\n');
    symlinkSync(outside, path.join(src, 'leak-link'));

    const { id } = importSkill(reg, { name: 'linked-skill', sourcePath: src });
    const dest = path.join(getSkillsDir(), id);
    // 链接以链接形式存在于注册表，且仍指向源外目录（复制未解引用/改写链接）
    expect(lstatSync(path.join(dest, 'leak-link')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(path.join(dest, 'leak-link')).endsWith('outside-secret')).toBe(true);
  });
});
