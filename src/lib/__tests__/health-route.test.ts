import { describe, expect, it } from 'vitest';
import { GET } from '../../app/api/health/route';

describe('GET /api/health', () => {
  it('returns ok with version', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe('string');
  });
});
