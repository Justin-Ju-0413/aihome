import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';

// 在 import route 前替换 workspace-config：指向临时目录，真实 path-security 校验
vi.mock('@/lib/workspace-config', () => ({
  getWorkspaceConfig: vi.fn(),
}));

import { GET, PUT } from '@/app/api/files/route';
import { getWorkspaceConfig } from '@/lib/workspace-config';

let root: string;
let filePath: string;
let dirPath: string;
let outsidePath: string;

function mockConfig(paths: string[]) {
  (getWorkspaceConfig as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    name: 'test', paths, groups: [], layout: {},
  });
}

function req(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
): NextRequest {
  return new NextRequest(url, init);
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-route-'));
  filePath = path.join(root, 'a.txt');
  fs.writeFileSync(filePath, 'hello');
  dirPath = path.join(root, 'sub');
  fs.mkdirSync(dirPath);
  outsidePath = path.join(os.tmpdir(), `outside-${Date.now()}`);
  fs.writeFileSync(outsidePath, 'outside');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outsidePath, { force: true });
});

describe('GET /api/files', () => {
  it('returns file content for a regular file inside workspace', async () => {
    mockConfig([root]);
    const res = await GET(req(`http://x/api/files?path=${encodeURIComponent(filePath)}`));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ content: 'hello', path: filePath });
  });

  it('returns 400 IS_DIRECTORY when the path is a directory (no EISDIR 500)', async () => {
    mockConfig([root]);
    const res = await GET(req(`http://x/api/files?path=${encodeURIComponent(dirPath)}`));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'Path is a directory', code: 'IS_DIRECTORY' });
  });

  it('returns 403 for paths outside the workspace', async () => {
    mockConfig([root]);
    const res = await GET(req(`http://x/api/files?path=${encodeURIComponent(outsidePath)}`));
    expect(res.status).toBe(403);
  });

  it('returns 400 when path param missing', async () => {
    const res = await GET(req('http://x/api/files'));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/files', () => {
  it('writes a new file inside workspace', async () => {
    mockConfig([root]);
    const target = path.join(root, 'new.txt');
    const res = await PUT(req('http://x/api/files', {
      method: 'PUT',
      body: JSON.stringify({ path: target, content: 'data' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    expect(fs.readFileSync(target, 'utf-8')).toBe('data');
  });

  it('refuses to write over a directory (IS_DIRECTORY, no EISDIR 500)', async () => {
    mockConfig([root]);
    const res = await PUT(req('http://x/api/files', {
      method: 'PUT',
      body: JSON.stringify({ path: dirPath, content: 'x' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'IS_DIRECTORY' });
  });

  it('returns 403 for writes outside workspace', async () => {
    mockConfig([root]);
    const res = await PUT(req('http://x/api/files', {
      method: 'PUT',
      body: JSON.stringify({ path: outsidePath, content: 'x' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(403);
  });
});
