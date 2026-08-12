import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

/**
 * API key 静态加密（AES-256-GCM）。
 *
 * 主密钥优先级：
 * 1. `AIHOME_WORKBENCH_ENC_KEY`（测试/e2e/高级用户显式配置）
 * 2. macOS Keychain（`com.justinju.aihome` / `workbench-master-key`）——首次使用自动生成随机密钥存入
 * 3. 都不可用 → 抛错拒绝存取（安全失败，不静默降级为明文）
 *
 * 存储格式：`enc:v1:<iv_b64>.<tag_b64>.<cipher_b64>`
 * 列名沿旧库 `key_encrypted`；旧明文数据（无前缀）读取时自动加密迁移写回。
 */

const PREFIX = 'enc:v1:';
const KEYCHAIN_SERVICE = 'com.justinju.aihome';
const KEYCHAIN_ACCOUNT = 'workbench-master-key';

function deriveKey(master: string): Buffer {
  return createHash('sha256').update(master).digest();
}

function keychainFind(): string | null {
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w'],
      { encoding: 'utf8', timeout: 5000 }
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

function keychainStore(secret: string): void {
  execFileSync(
    'security',
    ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w', secret],
    { timeout: 5000 }
  );
}

// 主密钥进程级缓存：避免每个 key 都 spawn 一次 `security` CLI（约 50ms/次）
let cachedMaster: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedMaster) return cachedMaster;
  const fromEnv = process.env.AIHOME_WORKBENCH_ENC_KEY;
  const master = fromEnv ? fromEnv : keychainFind();
  if (master) {
    cachedMaster = deriveKey(master);
    return cachedMaster;
  }
  // 首次使用：生成随机主密钥并存入 Keychain（无感，之后每次启动从 Keychain 读取）
  const generated = randomBytes(32).toString('base64');
  try {
    keychainStore(generated);
  } catch {
    throw new Error(
      'workbench 主密钥不可用：请设置环境变量 AIHOME_WORKBENCH_ENC_KEY（macOS Keychain 写入失败）'
    );
  }
  cachedMaster = deriveKey(generated);
  return cachedMaster;
}

export function encryptKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

/** 解密；旧明文（无前缀）原样返回，由调用方负责迁移写回 */
export function decryptKey(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const parts = stored.split('.');
  if (parts.length !== 3) throw new Error('workbench key 存储格式损坏');
  const ivB64 = parts[0].slice(PREFIX.length);
  const tagB64 = parts[1];
  const dataB64 = parts[2];
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('workbench key 存储格式损坏');
  const decipher = createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
