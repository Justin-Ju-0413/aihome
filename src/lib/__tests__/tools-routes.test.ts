import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/tools/route';
import { POST } from '@/app/api/tools/open/route';

const mocks = vi.hoisted(() => ({
  execImpl: vi.fn<(cmd: string, args: string[]) => string>(),
  spawn: vi.fn(() => ({ unref: () => {} })),
}));

vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(
    vi.fn(
      (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: Error | null, stdout: string) => void,
      ) => {
        try {
          cb(null, mocks.execImpl(cmd, args));
        } catch (err) {
          cb(err as Error, '');
        }
      },
    ),
    {
      [promisify.custom]: (cmd: string, args: string[]) =>
        Promise.resolve({ stdout: mocks.execImpl(cmd, args), stderr: '' }),
    },
  );
  return { execFile, spawn: mocks.spawn };
});

function toolsRequest(refresh = false) {
  const url = new URL('http://localhost:3000/api/tools');
  if (refresh) url.searchParams.set('refresh', '1');
  return new NextRequest(url);
}

function openRequest(toolId: unknown) {
  return new NextRequest('http://localhost:3000/api/tools/open', {
    method: 'POST',
    body: JSON.stringify({ toolId }),
  });
}

describe('/api/tools 路由', () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  const ENV_KEYS = [
    'AIHOME_TOOLS_CLAUDE_DIR',
    'AIHOME_TOOLS_CODEX_DIR',
    'AIHOME_TOOLS_OPENCODE_DIR',
    'AIHOME_TOOLS_CLAUDE_DESKTOP_APP',
    'AIHOME_TOOLS_CHATGPT_APP',
    'AIHOME_TOOLS_CLAUDE_DESKTOP_CONFIG',
    'AIHOME_VAULT_CLAUDE_CODE_CONFIG',
    'AIHOME_VAULT_CODEX_CONFIG',
    'AIHOME_VAULT_OPENCODE_CONFIG',
  ] as const;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'aihome-tools-routes-'));
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      process.env[key] = path.join(tmpDir, key.toLowerCase());
    }
    mocks.execImpl.mockImplementation(() => {
      throw new Error('not found');
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('GET 返回目录表全量工具的裸数组', async () => {
    const res = await GET(toolsRequest(true));

    expect(res.status).toBe(200);
    const tools = await res.json();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toHaveLength(5);
    expect(tools.map((t: { id: string }) => t.id)).toEqual([
      'claude-code', 'codex', 'opencode', 'claude-desktop', 'chatgpt-desktop',
    ]);
  });

  it('GET 默认走缓存（两次调用只探测一次）', async () => {
    await GET(toolsRequest(true));
    const callsAfterFirst = mocks.execImpl.mock.calls.length;

    await GET(toolsRequest());
    expect(mocks.execImpl.mock.calls.length).toBe(callsAfterFirst);
  });

  it('POST 已知工具触发固定 open 命令', async () => {
    const res = await POST(openRequest('claude-desktop'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.spawn).toHaveBeenCalledWith('open', ['-a', 'Claude'], expect.anything());
  });

  it('POST 未知工具返回 404', async () => {
    const res = await POST(openRequest('totally-fake-tool'));

    expect(res.status).toBe(404);
    expect(await res.json()).toHaveProperty('error');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('POST 非法 JSON 返回 400', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/tools/open', {
        method: 'POST',
        body: 'not-json',
      }),
    );

    expect(res.status).toBe(400);
  });
});
