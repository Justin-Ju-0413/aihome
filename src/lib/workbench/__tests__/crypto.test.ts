import { describe, expect, it } from 'vitest';
import { encryptKey, decryptKey, isEncrypted } from '../crypto';

// vitest.config.ts 已注入 AIHOME_WORKBENCH_ENC_KEY=test-master-key

describe('workbench key crypto', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const plain = 'sk-very-secret-1234567890';
    const stored = encryptKey(plain);
    expect(stored).not.toContain(plain);
    expect(isEncrypted(stored)).toBe(true);
    expect(decryptKey(stored)).toBe(plain);
  });

  it('produces different ciphertext per call (random IV) but all decrypt', () => {
    const a = encryptKey('sk-same');
    const b = encryptKey('sk-same');
    expect(a).not.toBe(b);
    expect(decryptKey(a)).toBe('sk-same');
    expect(decryptKey(b)).toBe('sk-same');
  });

  it('uses enc:v1: prefix with iv.tag.cipher layout', () => {
    const stored = encryptKey('sk-x');
    const [prefix, rest] = stored.split(':', 2);
    expect(prefix).toBe('enc');
    expect(rest.split(':').length).toBe(1); // 版本号不含冒号
    const parts = stored.slice('enc:v1:'.length).split('.');
    expect(parts).toHaveLength(3);
    for (const p of parts) expect(p.length).toBeGreaterThan(0);
  });

  it('returns legacy plaintext as-is when not encrypted', () => {
    expect(decryptKey('sk-legacy-plain')).toBe('sk-legacy-plain');
    expect(isEncrypted('sk-legacy-plain')).toBe(false);
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const stored = encryptKey('sk-tamper-me');
    const flipped = stored.slice(0, -1) + (stored.endsWith('A') ? 'B' : 'A');
    expect(() => decryptKey(flipped)).toThrow();
  });

  it('rejects corrupted format', () => {
    expect(() => decryptKey('enc:v1:only-one-part')).toThrow();
  });
});
