import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const REGISTRY_DIR = path.join(__dirname, '..', '.e2e-sync', 'registry');

test.describe('Registry API flow', () => {
  test.beforeAll(() => {
    fs.rmSync(REGISTRY_DIR, { recursive: true, force: true });
  });

  test('import → sync → list → delete cascade', async ({ request }) => {
    // doc-writer 是含 SKILL.md 的技能目录（importSkill 要求技能源）
    const sample = path.join(__dirname, '..', '..', 'data', 'sample-agents', 'doc-writer');
    const tmp = path.join(os.tmpdir(), 'aihome-e2e-import');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.cpSync(sample, tmp, { recursive: true });

    const importRes = await request.post('/api/registry/import', {
      data: { name: 'e2e-skill', sourcePath: tmp },
    });
    expect(importRes.status()).toBe(200);
    const imported = await importRes.json();
    expect(imported.id).toBe('e2e-skill');

    const syncRes = await request.post('/api/registry/sync');
    expect(syncRes.status()).toBe(200);
    const sync = await syncRes.json();
    expect(Array.isArray(sync.results)).toBe(true);

    const listRes = await request.get('/api/registry/skills');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.skills.some((s: { id: string }) => s.id === 'e2e-skill')).toBe(true);
    expect(Array.isArray(list.platforms)).toBe(true);

    const delRes = await request.delete('/api/registry/skills/e2e-skill');
    expect(delRes.status()).toBe(200);
    const list2 = await (await request.get('/api/registry/skills')).json();
    expect(list2.skills.some((s: { id: string }) => s.id === 'e2e-skill')).toBe(false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
