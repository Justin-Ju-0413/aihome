import { test, expect } from '@playwright/test';
import { ApiHelper } from '../helpers/api-helpers';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

test.describe('API Contract Tests', () => {
  let api: ApiHelper;

  test.beforeEach(async ({ request }) => {
    api = new ApiHelper(request);
  });

  test('GET /api/agents returns array', async () => {
    const agents = await api.getAgents();
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
    
    const first = agents[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('filePath');
  });

  test('POST /api/agents creates skill', async ({ request }) => {
    const result = await api.createAgent('skill', 'e2e-test-skill', 'Test skill description');
    expect(result).toHaveProperty('name');
    expect(result.type).toBe('skill');

    // Cleanup
    await api.deleteAgent(result.id);
  });

  test('POST /api/agents creates agent', async () => {
    const result = await api.createAgent('agent', 'e2e-test-agent', 'Test agent description');
    expect(result).toHaveProperty('name');
    expect(result.type).toBe('agent');

    // Cleanup
    await api.deleteAgent(result.id);
  });

  test('POST /api/agents returns 400 without name', async ({ request }) => {
    const res = await request.post('/api/agents', {
      data: { type: 'skill' },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/agents/[id] returns detail with content', async () => {
    const created = await api.createAgent('skill', 'e2e-detail-test', 'Detail test');
    
    const detail = await api.getAgent(created.id);
    expect(detail).toHaveProperty('content');
    expect(detail).toHaveProperty('parsed');
    expect(detail.content).toContain('e2e-detail-test');

    // Cleanup
    await api.deleteAgent(created.id);
  });

  test('PUT /api/agents/[id] updates agent', async () => {
    const created = await api.createAgent('agent', 'e2e-update-test', 'Original');
    
    const newContent = '# Updated Agent\n\nUpdated description\n';
    const result = await api.updateAgent(created.id, { content: newContent });
    expect(result.success).toBe(true);

    // Verify update
    const detail = await api.getAgent(created.id);
    expect(detail.content).toContain('Updated Agent');

    // Cleanup
    await api.deleteAgent(created.id);
  });

  test('DELETE /api/agents/[id] deletes agent', async ({ request }) => {
    const created = await api.createAgent('agent', 'e2e-delete-test', 'To be deleted');
    
    const res = await request.delete(`/api/agents/${created.id}`);
    const result = await res.json();
    expect(result.success).toBe(true);
  });

  test('POST /api/scan returns scan result', async ({ request }) => {
    const res = await request.post('/api/scan');
    const result = await res.json();
    
    expect(result).toHaveProperty('agents');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('scannedPaths');
    expect(result).toHaveProperty('timestamp');
    expect(Array.isArray(result.agents)).toBe(true);
  });

  test('GET /api/workspace returns config', async () => {
    const config = await api.getWorkspaceConfig();
    expect(config).toHaveProperty('name');
    expect(config).toHaveProperty('paths');
    expect(config).toHaveProperty('groups');
    expect(Array.isArray(config.paths)).toBe(true);
    expect(Array.isArray(config.groups)).toBe(true);
  });

  test('PUT /api/workspace updates config', async () => {
    const original = await api.getWorkspaceConfig();
    const updated = await api.updateWorkspaceConfig({ name: 'E2E Test Workspace' });
    expect(updated.name).toBe('E2E Test Workspace');

    // Restore
    await api.updateWorkspaceConfig({ name: original.name });
  });

  test('GET /api/relations returns array', async () => {
    const relations = await api.getRelations();
    expect(Array.isArray(relations)).toBe(true);
  });

  test('PUT /api/relations updates relations', async () => {
    const testRelations = [
      { id: 'test-1', source: 'a', target: 'b', type: 'calls' }
    ];
    const result = await api.updateRelations(testRelations);
    expect(result.success).toBe(true);

    const relations = await api.getRelations();
    expect(relations).toHaveLength(1);

    // Cleanup
    await api.updateRelations([]);
  });

  test('GET /api/files reads file', async ({ request }) => {
    const agents = await api.getAgents();
    expect(agents.length).toBeGreaterThan(0);

    const res = await request.get(`/api/files?path=${encodeURIComponent(agents[0].filePath)}`);
    const result = await res.json();

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('path');
    expect(result.content).toContain(agents[0].name);
  });

  test('GET /api/files rejects path outside workspace', async ({ request }) => {
    const res = await request.get(`/api/files?path=${encodeURIComponent('/etc/hosts')}`);
    expect(res.status()).toBe(403);
  });

  test('PUT /api/files writes file', async ({ request }) => {
    const testFile = path.join(PROJECT_ROOT, 'data', 'e2e-test-write.txt');
    
    const res = await request.put('/api/files', {
      data: { path: testFile, content: 'E2E test content' },
    });
    const result = await res.json();
    expect(result.success).toBe(true);

    // Verify and cleanup
    expect(fs.existsSync(testFile)).toBe(true);
    fs.unlinkSync(testFile);
  });
});
