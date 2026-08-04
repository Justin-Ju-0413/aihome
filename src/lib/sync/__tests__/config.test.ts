import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  configDir, repoDir, commonDir, metadataFile,
} from '../paths';
import {
  DEFAULT_ENDPOINTS, loadSyncConfig, saveSyncConfig, getEndpoints, setEndpoints, validateEndpointName, syncConfigPath,
} from '../config';

const tmpHome = path.join(os.tmpdir(), `aihome-sync-test-${process.pid}`);
const OLD_REPO = process.env.AIHOME_REPO_DIR;
const OLD_CFG = process.env.AIHOME_CONFIG_DIR;

beforeEach(async () => {
  process.env.AIHOME_REPO_DIR = path.join(tmpHome, 'repo');
  process.env.AIHOME_CONFIG_DIR = path.join(tmpHome, 'config');
  await fs.mkdir(path.join(tmpHome, 'config'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpHome, { recursive: true, force: true });
  if (OLD_REPO === undefined) delete process.env.AIHOME_REPO_DIR; else process.env.AIHOME_REPO_DIR = OLD_REPO;
  if (OLD_CFG === undefined) delete process.env.AIHOME_CONFIG_DIR; else process.env.AIHOME_CONFIG_DIR = OLD_CFG;
});

describe('paths', () => {
  it('resolves injected dirs', () => {
    expect(repoDir()).toBe(path.join(tmpHome, 'repo'));
    expect(commonDir()).toBe(path.join(tmpHome, 'repo', 'common'));
    expect(metadataFile()).toBe(path.join(tmpHome, 'repo', 'metadata.json'));
    expect(configDir()).toBe(path.join(tmpHome, 'config'));
  });

  it('has four default endpoints', () => {
    expect(Object.keys(DEFAULT_ENDPOINTS).sort()).toEqual(['claude', 'codex', 'hermes', 'opencode']);
  });
});

describe('sync config', () => {
  it('falls back to defaults when file missing', async () => {
    const config = await loadSyncConfig();
    expect(config).toEqual({ version: 1, endpoints: {} });
    expect(await getEndpoints()).toEqual(DEFAULT_ENDPOINTS);
  });

  it('saves and loads config', async () => {
    const endpoints = { alpha: '/tmp/alpha', beta: '/tmp/beta' };
    await setEndpoints(endpoints);
    expect(await loadSyncConfig()).toEqual({ version: 1, endpoints });
    expect(await getEndpoints()).toEqual(endpoints);
  });

  it('recovers from corrupt config', async () => {
    await fs.writeFile(syncConfigPath(), '{not json', 'utf-8');
    expect(await loadSyncConfig()).toEqual({ version: 1, endpoints: {} });
  });

  it('validates endpoint names', () => {
    expect(validateEndpointName('opencode')).toBe(true);
    expect(validateEndpointName('my-endpoint_2')).toBe(true);
    expect(validateEndpointName('has space')).toBe(false);
    expect(validateEndpointName('')).toBe(false);
    expect(validateEndpointName('UPPER')).toBe(true);
  });
});
