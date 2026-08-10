import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { lock, unlock, isUnlocked, getKey } from '../session';
import {
  vaultExists, readVault, writeVault, changePassword,
  emptyVaultData, maskKey,
} from '../store';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-store-'));
const vaultFile = path.join(dir, 'vault.enc');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_FILE = vaultFile;
  fs.rmSync(vaultFile, { force: true });
  lock();
});

afterAll(() => {
  process.env = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('vault store', () => {
  it('first unlock creates an empty vault and unlocks', () => {
    expect(unlock('my-password-1')).toBe(true);
    expect(isUnlocked()).toBe(true);
    expect(vaultExists()).toBe(true);
    expect(readVault()).toEqual(emptyVaultData());
  });

  it('rejects a wrong password on existing vault', () => {
    unlock('my-password-1');
    lock();
    expect(unlock('wrong')).toBe(false);
    expect(isUnlocked()).toBe(false);
  });

  it('unlocks with the correct password after lock', () => {
    unlock('my-password-1');
    lock();
    expect(unlock('my-password-1')).toBe(true);
  });

  it('persists providers and activated across sessions', () => {
    unlock('my-password-1');
    const data = readVault()!;
    data.providers.push({
      id: 'p_1', name: 'Test', baseUrl: 'https://example.com', model: 'm',
      apiKey: 'sk-test-1234', createdAt: new Date().toISOString(),
    });
    data.activated['claude-code'] = 'p_1';
    writeVault(data);
    lock();
    unlock('my-password-1');
    const reloaded = readVault()!;
    expect(reloaded.providers).toHaveLength(1);
    expect(reloaded.providers[0].apiKey).toBe('sk-test-1234');
    expect(reloaded.activated['claude-code']).toBe('p_1');
  });

  it('sets 0600 permissions on the vault file', () => {
    unlock('my-password-1');
    const mode = fs.statSync(vaultFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('changePassword re-encrypts: old fails, new works', () => {
    unlock('my-password-1');
    changePassword('my-password-1', 'new-password-9');
    lock();
    expect(unlock('my-password-1')).toBe(false);
    expect(unlock('new-password-9')).toBe(true);
  });

  it('getKey is null when locked and a buffer when unlocked', () => {
    expect(getKey()).toBeNull();
    unlock('my-password-1');
    expect(getKey()).toBeInstanceOf(Buffer);
    lock();
    expect(getKey()).toBeNull();
  });

  it('maskKey keeps tail 4 chars', () => {
    expect(maskKey('sk-test-abcdef')).toBe('sk-***cdef');
    expect(maskKey('short')).toBe('***');
  });
});
