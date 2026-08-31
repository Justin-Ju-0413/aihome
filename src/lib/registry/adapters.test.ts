import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BUILTIN_ADAPTERS, isManagedLink } from './adapters';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'aihome-adapter-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('BUILTIN_ADAPTERS', () => {
  it('has three platforms with expected skill dirs', () => {
    const names = BUILTIN_ADAPTERS.map((a) => a.name).sort();
    expect(names).toEqual(['claude-code', 'codex', 'workbuddy']);
    expect(BUILTIN_ADAPTERS.find((a) => a.name === 'claude-code')?.skillDir).toContain('.claude');
    expect(BUILTIN_ADAPTERS.find((a) => a.name === 'codex')?.skillDir).toContain('.codex');
    expect(BUILTIN_ADAPTERS.find((a) => a.name === 'workbuddy')?.skillDir).toContain('.workbuddy');
  });
});

describe('isManagedLink', () => {
  it('recognizes symlink pointing to canonical dir', () => {
    const canonical = path.join(dir, 'canonical');
    const platform = path.join(dir, 'platform');
    mkdirSync(canonical);
    mkdirSync(platform);
    const link = path.join(platform, 'skill-a');
    symlinkSync(canonical, link, 'dir');
    expect(isManagedLink(link, canonical)).toBe(true);
  });

  it('returns false for real directory', () => {
    const canonical = path.join(dir, 'canonical');
    mkdirSync(canonical);
    const real = path.join(dir, 'platform', 'skill-b');
    mkdirSync(real, { recursive: true });
    expect(isManagedLink(real, canonical)).toBe(false);
  });

  it('returns false for symlink pointing elsewhere', () => {
    const canonical = path.join(dir, 'canonical');
    const other = path.join(dir, 'other');
    const platform = path.join(dir, 'platform');
    mkdirSync(canonical);
    mkdirSync(other);
    mkdirSync(platform);
    const link = path.join(platform, 'skill-c');
    symlinkSync(other, link, 'dir');
    expect(isManagedLink(link, canonical)).toBe(false);
  });

  it('returns false for nonexistent path', () => {
    expect(isManagedLink(path.join(dir, 'nope'), path.join(dir, 'canonical'))).toBe(false);
  });
});
