import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isPathWithinWorkspace,
  isExistingPathWithinWorkspace,
  isNewPathWithinWorkspace,
} from '../path-security';

let root: string;
let dir: string;
let innerDir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-sec-'));
  root = path.join(dir, 'workspace');
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, 'inner'));
  innerDir = path.join(root, 'inner');
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('isPathWithinWorkspace (lexical)', () => {
  it('accepts paths inside the root', () => {
    expect(isPathWithinWorkspace(path.join(root, 'agent'), [root])).toBe(true);
    expect(isPathWithinWorkspace(path.join(root, 'a', 'b', 'c'), [root])).toBe(true);
    expect(isPathWithinWorkspace(root, [root])).toBe(true);
  });
  it('rejects .. traversal', () => {
    expect(isPathWithinWorkspace(path.join(root, '..', 'evil'), [root])).toBe(false);
    expect(isPathWithinWorkspace(path.join(root, 'a', '..', '..', 'evil'), [root])).toBe(false);
  });
  it('rejects absolute paths outside the root', () => {
    expect(isPathWithinWorkspace('/etc/passwd', [root])).toBe(false);
    expect(isPathWithinWorkspace(os.homedir(), [root])).toBe(false);
  });
  it('rejects sibling prefixes that merely start with the root name', () => {
    // /tmp/x-workspace 不应被 /tmp/x/workspace 的规则放行
    const fakeRoot = path.join(dir, 'x-workspace');
    expect(isPathWithinWorkspace(fakeRoot, [root])).toBe(false);
  });
  it('supports multiple roots', () => {
    const other = path.join(dir, 'other-root');
    fs.mkdirSync(other);
    expect(isPathWithinWorkspace(path.join(other, 'x'), [root, other])).toBe(true);
    expect(isPathWithinWorkspace(path.join(root, 'x'), [other])).toBe(false);
  });
  it('handles unicode names', () => {
    const uni = path.join(root, '智能体-中文字段');
    expect(isPathWithinWorkspace(uni, [root])).toBe(true);
    expect(isPathWithinWorkspace(path.join(uni, '..', '..', '逃逸'), [root])).toBe(false);
  });
});

describe('isExistingPathWithinWorkspace (symlink resolution)', () => {
  it('accepts a real file inside the root', async () => {
    const f = path.join(root, 'ok.md');
    fs.writeFileSync(f, 'x');
    expect(await isExistingPathWithinWorkspace(f, [root])).toBe(true);
  });
  it('rejects a symlink escaping the root', async () => {
    const outside = path.join(dir, 'outside.txt');
    fs.writeFileSync(outside, 'secret');
    const link = path.join(root, 'link.md');
    fs.symlinkSync(outside, link);
    // 词法判定放行（链接本身在 root 内），realpath 后必须拒绝
    expect(isPathWithinWorkspace(link, [root])).toBe(true);
    expect(await isExistingPathWithinWorkspace(link, [root])).toBe(false);
  });
  it('rejects a missing path', async () => {
    expect(await isExistingPathWithinWorkspace(path.join(root, 'nope.md'), [root])).toBe(false);
  });
});

describe('isNewPathWithinWorkspace (parent resolution)', () => {
  it('accepts a new file under an existing parent', async () => {
    // 调用方惯例：先验证 baseDir 存在，再创建其下新目录（route 层如此调用）
    fs.mkdirSync(path.join(root, 'new-agent'));
    expect(await isNewPathWithinWorkspace(path.join(root, 'new-agent', 'SKILL.md'), [root])).toBe(true);
  });
  it('safely rejects when the parent directory does not exist yet', async () => {
    // realpath(父目录) 失败 → false（安全方向：拒绝而非放行）
    expect(await isNewPathWithinWorkspace(path.join(root, 'ghost-dir', 'SKILL.md'), [root])).toBe(false);
  });
  it('accepts a new file under a symlinked parent that stays inside', async () => {
    const innerReal = path.join(root, 'inner');
    const link = path.join(root, 'inner-link');
    fs.symlinkSync(innerReal, link);
    expect(await isNewPathWithinWorkspace(path.join(link, 'new.md'), [root])).toBe(true);
  });
  it('rejects a new file whose parent symlink escapes', async () => {
    const link = path.join(root, 'escape-link');
    fs.symlinkSync(dir, link); // 指向 root 之外
    expect(await isNewPathWithinWorkspace(path.join(link, 'new.md'), [root])).toBe(false);
  });
});
