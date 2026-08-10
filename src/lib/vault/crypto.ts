import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const KEY_LEN = 32;
const SCRYPT_N = 2 ** 15;
const IV_LEN = 12;
const TAG_LEN = 16;

export function deriveKey(password: string, salt: Buffer): Buffer {
  // maxmem: scrypt needs 128 * N * r = 32MiB at N=2^15; the default maxmem is
  // exactly 32MiB, which newer Node/OpenSSL rejects (memory limit exceeded).
  return scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, maxmem: 64 * 1024 * 1024 });
}

export interface EncryptedPayload {
  salt: string;
  iv: string;
  data: string;
}

export function encryptJson(plain: unknown, password: string): EncryptedPayload {
  const salt = randomBytes(16);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(plain), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    data: Buffer.concat([cipher.getAuthTag(), ciphertext]).toString('hex'),
  };
}

export function decryptJson<T>(payload: EncryptedPayload, password: string): T {
  const salt = Buffer.from(payload.salt, 'hex');
  const iv = Buffer.from(payload.iv, 'hex');
  const raw = Buffer.from(payload.data, 'hex');
  const tag = raw.subarray(0, TAG_LEN);
  const ciphertext = raw.subarray(TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
