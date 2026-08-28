import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { HttpError, jsonError, readJsonBody, handleRouteError } from '../api-response';

describe('jsonError', () => {
  it('returns { error } with given status, and code when provided', async () => {
    const res = jsonError('name required', 400);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'name required' });

    const res2 = jsonError('not found', 404, 'AGENT_NOT_FOUND');
    expect(res2.status).toBe(404);
    await expect(res2.json()).resolves.toEqual({ error: 'not found', code: 'AGENT_NOT_FOUND' });
  });

  it('defaults status to 400', () => {
    expect(jsonError('bad').status).toBe(400);
  });
});

describe('readJsonBody', () => {
  it('parses valid JSON body', async () => {
    const req = new NextRequest('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'content-type': 'application/json' },
    });
    await expect(readJsonBody(req)).resolves.toEqual({ a: 1 });
  });

  it('throws HttpError(400) on malformed body', async () => {
    const req = new NextRequest('http://localhost/api', {
      method: 'POST',
      body: '{ not json',
      headers: { 'content-type': 'application/json' },
    });
    const e = (await readJsonBody(req).catch((err: unknown) => err)) as HttpError;
    expect(e).toBeInstanceOf(HttpError);
    expect(e.status).toBe(400);
    expect(e.message).toBe('无效的 JSON');
  });
});

describe('handleRouteError', () => {
  it('surfaces HttpError status/message/code verbatim', async () => {
    const res = handleRouteError(new HttpError(403, 'forbidden', 'FORBIDDEN'), 'fallback');
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden', code: 'FORBIDDEN' });
  });

  it('logs unexpected errors and returns fallback 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = handleRouteError(new Error('boom'), 'Failed to create agent');
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Failed to create agent' });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
