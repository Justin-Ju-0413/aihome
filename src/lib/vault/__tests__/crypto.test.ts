import { describe, it, expect } from 'vitest';
import { encryptJson, decryptJson, deriveKey } from '../crypto';

describe('vault crypto', () => {
  it('round-trips a payload', () => {
    const enc = encryptJson({ providers: [], ok: true }, 'hunter2hunter');
    expect(decryptJson(enc, 'hunter2hunter')).toEqual({ providers: [], ok: true });
  });

  it('rejects a wrong password', () => {
    const enc = encryptJson({ secret: 1 }, 'correct-password');
    expect(() => decryptJson(enc, 'wrong-password')).toThrow();
  });

  it('rejects a tampered ciphertext', () => {
    const enc = encryptJson({ secret: 1 }, 'pw');
    const bad = { ...enc, data: '00' + enc.data.slice(2) };
    expect(() => decryptJson(bad, 'pw')).toThrow();
  });

  it('uses a fresh salt and iv each write', () => {
    const a = encryptJson({ x: 1 }, 'pw');
    const b = encryptJson({ x: 1 }, 'pw');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('derives a stable key for same password+salt', () => {
    const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    expect(deriveKey('pw', salt).toString('hex')).toBe(deriveKey('pw', salt).toString('hex'));
    expect(deriveKey('pw', salt).toString('hex')).not.toBe(deriveKey('pw2', salt).toString('hex'));
  });
});
