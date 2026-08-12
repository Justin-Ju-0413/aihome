import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
// CONFIG_DIR 在模块加载时求值，须在 import 前设置 env（hoisted 回调只允许全局操作）
vi.hoisted(() => {
  process.env.AIHOME_CONFIG_DIR = `/tmp/ws-config-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
});
import {
  getWorkspaceConfig, saveWorkspaceConfig, validateWorkspaceConfig,
  getLayout, saveLayout, getRelations, saveRelations,
} from '../workspace-config';

const CONFIG_DIR = process.env.AIHOME_CONFIG_DIR!;

beforeAll(() => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
});

describe('validateWorkspaceConfig', () => {
  const valid = {
    name: 'AIHome',
    paths: ['/tmp/a', '/tmp/b'],
    groups: [
      { id: 'default', name: 'Default', color: '#6366f1', description: 'd' },
      { id: 'agents', name: 'Agents', color: '#10b981', description: '' },
    ],
    layout: {},
  };

  it('accepts a valid config', () => {
    expect(validateWorkspaceConfig(valid)).toBe(true);
  });
  it('rejects non-object / missing name / empty or too-long name', () => {
    expect(validateWorkspaceConfig(null)).toBe(false);
    expect(validateWorkspaceConfig(42)).toBe(false);
    expect(validateWorkspaceConfig({ ...valid, name: '' })).toBe(false);
    expect(validateWorkspaceConfig({ ...valid, name: '   ' })).toBe(false);
    expect(validateWorkspaceConfig({ ...valid, name: 'x'.repeat(101) })).toBe(false);
  });
  it('rejects empty/oversized/blank paths', () => {
    expect(validateWorkspaceConfig({ ...valid, paths: [] })).toBe(false);
    expect(validateWorkspaceConfig({ ...valid, paths: new Array(33).fill('/x') })).toBe(false);
    expect(validateWorkspaceConfig({ ...valid, paths: ['/ok', '  '] })).toBe(false);
    expect(validateWorkspaceConfig({ ...valid, paths: ['/ok', 5] })).toBe(false);
  });
  it('rejects group id format / duplicates / invalid colors', () => {
    expect(validateWorkspaceConfig({ ...valid, groups: [{ id: 'bad id', name: 'x', color: '#fff000' }] })).toBe(false);
    expect(validateWorkspaceConfig({
      ...valid,
      groups: [
        { id: 'dup', name: 'a', color: '#ffffff' },
        { id: 'dup', name: 'b', color: '#000000' },
      ],
    })).toBe(false);
    expect(validateWorkspaceConfig({ ...valid, groups: [{ id: 'ok', name: 'x', color: 'red' }] })).toBe(false);
    expect(validateWorkspaceConfig({ ...valid, groups: [{ id: 'ok', name: 'x', color: '#fff00' }] })).toBe(false);
  });
});

describe('workspace config persistence', () => {
  it('returns defaults when no config file exists', async () => {
    const config = await getWorkspaceConfig();
    expect(config.name).toBe('AIHome');
    expect(config.paths[0]).toContain('data');
    expect(config.groups.length).toBe(3);
  });

  it('round-trips saved config', async () => {
    const custom = {
      name: 'Test WS',
      paths: ['/tmp/ws'],
      groups: [{ id: 'g1', name: 'G1', color: '#123456', description: 'x' }],
      layout: { agent1: { x: 1, y: 2 } },
    };
    await saveWorkspaceConfig(custom);
    const loaded = await getWorkspaceConfig();
    expect(loaded.name).toBe('Test WS');
    expect(loaded.paths).toEqual(['/tmp/ws']);
    expect(loaded.groups).toHaveLength(1);
  });

  it('round-trips layout and relations', async () => {
    await saveLayout({ agent1: { group: 'default', order: 0 } });
    expect(await getLayout()).toEqual({ agent1: { group: 'default', order: 0 } });
    await saveRelations([{ id: 'r1', source: 'a', target: 'b', type: 'calls' }]);
    expect(await getRelations()).toEqual([{ id: 'r1', source: 'a', target: 'b', type: 'calls' }]);
    // 缺失时返回空默认
    fs.rmSync(path.join(CONFIG_DIR, 'layout.json'));
    fs.rmSync(path.join(CONFIG_DIR, 'relations.json'));
    expect(await getLayout()).toEqual({});
    expect(await getRelations()).toEqual([]);
  });
});
