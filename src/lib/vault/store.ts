import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { configDir } from '@/lib/sync/paths';
import { decryptJson, encryptJson } from './crypto';

export const SESSION_TTL_MS = 60 * 60 * 1000;
export type ToolId = 'claude-code' | 'codex' | 'opencode';

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  createdAt: string;
  lastUsedAt?: string;
  configUpdatedAt?: string;
}

export interface VaultData {
  providers: ProviderConfig[];
  activated: Record<ToolId, string | null>;
  lastWritten: Record<string, { path: string; fingerprint: string }>;
}

let sessionPassword: string | null = null;
let expiresAt = 0;

export function emptyVaultData(): VaultData {
  return {
    providers: [],
    activated: { 'claude-code': null, codex: null, opencode: null },
    lastWritten: {},
  };
}

export function vaultFilePath(): string {
  return process.env.AIHOME_VAULT_FILE ?? path.join(configDir(), 'vault.enc');
}

export function vaultExists(): boolean {
  return fs.existsSync(vaultFilePath());
}

export function isUnlocked(): boolean {
  return sessionPassword !== null && Date.now() < expiresAt;
}

export function getKey(): Buffer | null {
  if (!isUnlocked()) return null;
  return Buffer.from(sessionPassword as string, 'utf8');
}

export function touchSession(): void {
  if (sessionPassword) expiresAt = Date.now() + SESSION_TTL_MS;
}

export function unlock(password: string): boolean {
  if (!vaultExists()) {
    sessionPassword = password;
    expiresAt = Date.now() + SESSION_TTL_MS;
    writeVault(emptyVaultData());
    return true;
  }
  try {
    const env = readEnvelope();
    decryptJson(env, password);
    sessionPassword = password;
    expiresAt = Date.now() + SESSION_TTL_MS;
    return true;
  } catch {
    sessionPassword = null;
    return false;
  }
}

export function lock(): void {
  sessionPassword = null;
  expiresAt = 0;
}

function requireUnlocked(): void {
  if (!isUnlocked()) throw new Error('vault is locked');
}

function readEnvelope(): { salt: string; iv: string; data: string } {
  const raw = fs.readFileSync(vaultFilePath(), 'utf8');
  return JSON.parse(raw) as { salt: string; iv: string; data: string };
}

export function readVault(): VaultData | null {
  if (!vaultExists()) return null;
  requireUnlocked();
  const data = decryptJson<VaultData>(readEnvelope(), sessionPassword as string);
  if (!data || !Array.isArray(data.providers) || typeof data.activated !== 'object') {
    throw new Error('vault 文件损坏或密码错误');
  }
  return data;
}

export function writeVault(data: VaultData): void {
  requireUnlocked();
  const env = encryptJson(data, sessionPassword as string);
  const file = vaultFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, ...env }, null, 2));
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
}

export function changePassword(oldPassword: string, newPassword: string): void {
  if (!vaultExists()) throw new Error('vault not found');
  const env = readEnvelope();
  const data = decryptJson<VaultData>(env, oldPassword); // throws on wrong old password
  const tmpKey = sessionPassword;
  sessionPassword = newPassword;
  writeVault(data);
  sessionPassword = tmpKey ?? newPassword;
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 3)}***${key.slice(-4)}`;
}

export function newProviderId(): string {
  return `p_${randomUUID().slice(0, 8)}`;
}
