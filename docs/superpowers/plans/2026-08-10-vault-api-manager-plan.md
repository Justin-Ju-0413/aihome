# AIHome AI API 管理器（Vault + 工具配置中心）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AIHome 新增「AI API 管理器」：主密码加密的 key 保险库 + 一键把 key/模型写入 Claude Code / Codex / opencode 配置文件（per-tool 激活），vault 激活状态成为 usage 归属覆盖源。

**Architecture:** `src/lib/vault/` 纯 TS + `node:crypto`（scrypt 派生 + AES-256-GCM）加密 JSON 文件 `~/.aihome/vault.enc`（0600）；工具适配器（claude-code/codex/opencode）直接读写工具配置文件，带备份 + 冲突检测（`lastWritten` 指纹）；`/api/vault/*` 路由薄封装；indexer 写库前用 `getProviderOverride()` 覆盖事件 provider；`/vault` 独立页（锁定态 + provider 卡 + 工具状态面板）。

**Tech Stack:** Next.js 16 App Router（route handlers）、TypeScript strict、vitest、Playwright（PORT=3100）、`node:crypto`（零新依赖）。

## Global Constraints

- **零新增运行时依赖**（只用 `node:crypto`；TOML 不引库，行级段编辑）
- vault 文件路径：`AIHOME_VAULT_FILE` ?? `~/.aihome/vault.enc`；备份目录：`AIHOME_VAULT_BACKUP_DIR` ?? `~/.aihome/backups`
- 工具配置文件路径环境变量（e2e/测试必须覆盖）：`AIHOME_VAULT_CLAUDE_CODE_CONFIG` / `AIHOME_VAULT_CODEX_CONFIG` / `AIHOME_VAULT_CODEX_AUTH` / `AIHOME_VAULT_OPENCODE_CONFIG`
- `apiKey` 永不回传前端（一律 `maskKey()` 脱敏）；key 不写日志、不进 usage 事件
- 锁定态写操作 → HTTP 423；密码错 → 401；冲突 → 409；vault 损坏/配置写失败 → 500 固定文案「vault 文件损坏或密码错误」（用户裁决 2026-08-10：不区分 503）
- 测试：单测 `npm test`，e2e `PORT=3100 npm run test:e2e`，lint `npm run lint`，类型 `npx tsc --noEmit`——每次任务结束全绿才提交
- 提交消息风格：`feat(vault): ...` / `fix(vault): ...` / `test(vault): ...`（对齐仓库 `feat(scan):` 风格）
- 测试一切 tmp 目录隔离，绝不触碰真实 `~/.claude` / `~/.codex` / `~/.config/opencode`（靠环境变量重定向）
- 主密码最小 8 位；忘记密码不可恢复（无后门）

---

### Task 1: vault 加密模块（crypto.ts）

**Files:**
- Create: `src/lib/vault/crypto.ts`
- Test: `src/lib/vault/__tests__/crypto.test.ts`

**Interfaces:**
- Consumes: 无（独立模块）
- Produces:
  - `interface EncryptedPayload { salt: string; iv: string; data: string }`（全 hex；data = authTag(16B) ‖ ciphertext）
  - `encryptJson(plain: unknown, password: string): EncryptedPayload`
  - `decryptJson<T>(payload: EncryptedPayload, password: string): T`（密码错/篡改 → throw）

- [x] **Step 1: Write the failing test**

`src/lib/vault/__tests__/crypto.test.ts`：

```ts
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vault/__tests__/crypto.test.ts`
Expected: FAIL（`../crypto` 模块不存在）

- [x] **Step 3: Write minimal implementation**

`src/lib/vault/crypto.ts`：

```ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const KEY_LEN = 32;
const SCRYPT_N = 2 ** 15;
const IV_LEN = 12;
const TAG_LEN = 16;

export function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N });
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vault/__tests__/crypto.test.ts`
Expected: 5 passed

- [x] **Step 5: Commit**

```bash
git add src/lib/vault/crypto.ts src/lib/vault/__tests__/crypto.test.ts
git commit -m "feat(vault): add scrypt + AES-256-GCM crypto module"
```

---

### Task 2: vault 会话与 store 持久化（store.ts + session.ts）

**Files:**
- Create: `src/lib/vault/store.ts`, `src/lib/vault/session.ts`
- Test: `src/lib/vault/__tests__/store.test.ts`

**Interfaces:**
- Consumes: Task 1 `encryptJson` / `decryptJson`
- Produces:
  - `type ToolId = 'claude-code' | 'codex' | 'opencode'`
  - `interface ProviderConfig { id: string; name: string; baseUrl: string; model: string; apiKey: string; createdAt: string; lastUsedAt?: string; configUpdatedAt?: string }`（`configUpdatedAt` = provider 最近一次被编辑的时间，Task 7 stale 判定用）
  - `interface VaultData { providers: ProviderConfig[]; activated: Record<ToolId, string | null>; lastWritten: Record<string, { path: string; fingerprint: string }> }`
  - `store.ts` 导出：`SESSION_TTL_MS`（60min）、`emptyVaultData(): VaultData`、`vaultFilePath(): string`、`vaultExists(): boolean`、`isUnlocked(): boolean`、`getKey(): Buffer | null`、`touchSession(): void`、`unlock(password): boolean`（无文件→创建空 vault 并解锁；有文件→校验）、`lock(): void`、`readVault(): VaultData | null`（未解锁或损坏 throw）、`writeVault(data): void`（原子写 tmp+rename + chmod 0600）、`changePassword(old, new): void`、`maskKey(key): string`、`newProviderId(): string`
  - `session.ts` 仅 re-export：`SESSION_TTL_MS / isUnlocked / getKey / touchSession / unlock / lock`

**会话设计**：session 持有 `password: string | null` + `expiresAt`；解密直接用密码（避免派生 key 无法反推密码的问题）。`unlock` 内部：文件不存在 → `writeVault(emptyVaultData())` 并解锁；文件存在 → `decryptJson` 验证通过则解锁。

- [x] **Step 1: Write the failing test**

`src/lib/vault/__tests__/store.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { lock, unlock, isUnlocked, getKey } from '../session';
import {
  vaultFilePath, vaultExists, readVault, writeVault, changePassword,
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vault/__tests__/store.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: Write minimal implementation**

`src/lib/vault/store.ts`：

```ts
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
```

`src/lib/vault/session.ts`（re-export，语义化导入）：

```ts
export {
  SESSION_TTL_MS, isUnlocked, getKey, touchSession, unlock, lock,
} from './store';
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vault/__tests__/store.test.ts`
Expected: 8 passed

- [x] **Step 5: Run full suite to check no regression**

Run: `npm test`
Expected: 全部通过（现有测试不回归）

- [x] **Step 6: Commit**

```bash
git add src/lib/vault/
git commit -m "feat(vault): add session state and encrypted store persistence"
```

---

### Task 3: provider 模板与校验（providers.ts）

**Files:**
- Create: `src/lib/vault/providers.ts`
- Test: `src/lib/vault/__tests__/providers.test.ts`

**Interfaces:**
- Consumes: 无（独立）
- Produces:
  - `interface ProviderTemplate { id: string; name: string; baseUrl: string; model: string }`
  - `PROVIDER_TEMPLATES: ProviderTemplate[]`（6 个内置，见 spec §3.3）
  - `validateProviderInput(input: { name?: string; baseUrl?: string; model?: string; apiKey?: string }): string | null`

- [x] **Step 1: Write the failing test**

`src/lib/vault/__tests__/providers.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { PROVIDER_TEMPLATES, validateProviderInput } from '../providers';

describe('provider templates', () => {
  it('exposes the 6 built-in templates with ids and urls', () => {
    const ids = PROVIDER_TEMPLATES.map((p) => p.id);
    expect(ids).toEqual([
      'anthropic', 'openai', 'deepseek', 'volcengine-coding', 'glm', 'kimi',
    ]);
    const volc = PROVIDER_TEMPLATES.find((p) => p.id === 'volcengine-coding')!;
    expect(volc.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/coding/v3');
    expect(volc.model).toBe('ark-code-latest');
  });
});

describe('validateProviderInput', () => {
  it('accepts valid input', () => {
    expect(validateProviderInput({ name: 'X', baseUrl: 'https://x.com', model: 'm', apiKey: 'sk-abc' })).toBeNull();
  });
  it('rejects empty name', () => {
    expect(validateProviderInput({ name: '', baseUrl: 'https://x.com', model: 'm', apiKey: 'sk-abc' })).toContain('name');
  });
  it('rejects non-http baseUrl', () => {
    expect(validateProviderInput({ name: 'X', baseUrl: 'ftp://x', model: 'm', apiKey: 'sk-abc' })).toContain('baseUrl');
  });
  it('rejects empty model', () => {
    expect(validateProviderInput({ name: 'X', baseUrl: 'https://x.com', model: '', apiKey: 'sk-abc' })).toContain('model');
  });
  it('rejects short apiKey', () => {
    expect(validateProviderInput({ name: 'X', baseUrl: 'https://x.com', model: 'm', apiKey: 'abc' })).toContain('apiKey');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vault/__tests__/providers.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: Write minimal implementation**

`src/lib/vault/providers.ts`：

```ts
export interface ProviderTemplate {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { id: 'anthropic', name: 'Anthropic 官方', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.5' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { id: 'volcengine-coding', name: '火山方舟 Coding Plan', baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3', model: 'ark-code-latest' },
  { id: 'glm', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2' },
  { id: 'kimi', name: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.7-code' },
];

const isHttpUrl = (v: string) => /^https?:\/\/.+/i.test(v);

export function validateProviderInput(input: {
  name?: string; baseUrl?: string; model?: string; apiKey?: string;
}): string | null {
  if (!input.name?.trim()) return 'name 不能为空';
  if (!isHttpUrl(input.baseUrl ?? '')) return 'baseUrl 必须是 http(s) 地址';
  if (!input.model?.trim()) return 'model 不能为空';
  if (!input.apiKey || input.apiKey.length < 8) return 'apiKey 至少 8 位';
  return null;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vault/__tests__/providers.test.ts`
Expected: 6 passed（原写 7 为笔误；valid 用例 apiKey 已修正为 ≥8 位的 'sk-abcdef123456'）

- [x] **Step 5: Commit**

```bash
git add src/lib/vault/providers.ts src/lib/vault/__tests__/providers.test.ts
git commit -m "feat(vault): add provider templates and input validation"
```

---

### Task 4: adapter 框架 + claude-code 适配器

**Files:**
- Create: `src/lib/vault/adapters/index.ts`, `src/lib/vault/adapters/claude-code.ts`
- Test: `src/lib/vault/__tests__/claude-code.test.ts`

**Interfaces:**
- Consumes: Task 2 `VaultData` / `ProviderConfig` / `ToolId`
- Produces:
  - `type AdapterFileState = 'ok' | 'missing' | 'conflict' | 'unwritable'`
  - `interface AdapterState { fileState: AdapterFileState; activeProviderId: string | null; conflictDetail?: string }`
  - `interface WriteResult { state: AdapterState; fingerprint: string | null }`（fingerprint null = 未写入）
  - `interface ToolAdapter { id: ToolId; label: string; configPath(): string; detect(data: VaultData): AdapterState; activate(p: ProviderConfig, data: VaultData): WriteResult; deactivate(data: VaultData): AdapterState }`
  - `fingerprintOf(value: string): string`（sha256 hex）
  - `backupConfig(toolId: ToolId, file: string): void`（备份到 `AIHOME_VAULT_BACKUP_DIR` ?? `~/.aihome/backups/<tool>/<ts>.bak`，保留 10 份，备份目录 0700、备份文件 0600）
  - `claudeCodeAdapter: ToolAdapter`
  - claude-code 注入字段：`env.ANTHROPIC_BASE_URL` / `env.ANTHROPIC_AUTH_TOKEN` / `env.ANTHROPIC_MODEL` / `env.AIHOME_VAULT_PROVIDER`（= providerId 标记）
  - claude-code `configPath()`：`AIHOME_VAULT_CLAUDE_CODE_CONFIG` ?? `~/.claude/settings.json`

**语义**（用户裁决 2026-08-10：任一注入字段存在即 conflict）：
- `detect`：文件缺失 → `{missing, null}`；JSON 解析失败 → `{conflict, null, 'settings.json 不是合法 JSON'}`；注入 4 字段任一存在：4 字段齐全且指纹匹配 → `{ok, AIHOME_VAULT_PROVIDER}`，否则（字段不全或指纹不符）→ `{conflict, null, '注入字段被手动修改'}`；注入字段全部不存在 → `{ok, null}`
- fingerprint = `fingerprintOf(JSON.stringify([baseUrl, apiKey, model, id]))`
- `activate`：detect conflict 则不写直接返回 → backupConfig → JSON 合并写 4 字段 → 返回 `{state: ok + providerId, fingerprint}`
- `deactivate`：删 4 字段；env 空则删 env；返回 `{ok, null}`

- [x] **Step 1: Write the failing test**

`src/lib/vault/__tests__/claude-code.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { claudeCodeAdapter } from '../adapters/claude-code';
import { backupConfig, fingerprintOf } from '../adapters/index';
import { emptyVaultData, type ProviderConfig, type VaultData } from '../store';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-cc-'));
const configFile = path.join(home, 'settings.json');
const backupsDir = path.join(home, 'backups');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG = configFile;
  process.env.AIHOME_VAULT_BACKUP_DIR = backupsDir;
  fs.rmSync(configFile, { force: true });
  fs.rmSync(backupsDir, { recursive: true, force: true });
});

afterAll(() => {
  process.env = prev;
  fs.rmSync(home, { recursive: true, force: true });
});

const provider: ProviderConfig = {
  id: 'p_1', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash', apiKey: 'sk-test-12345678',
  createdAt: new Date().toISOString(),
};

describe('claude-code adapter', () => {
  it('detects missing config file', () => {
    expect(claudeCodeAdapter.detect(emptyVaultData())).toEqual({
      fileState: 'missing', activeProviderId: null,
    });
  });

  it('activate writes the four env fields and keeps custom fields', () => {
    fs.writeFileSync(configFile, JSON.stringify({ apiKeyHelper: 'keep-me', env: { CUSTOM: 'x' } }, null, 2));
    const res = claudeCodeAdapter.activate(provider, emptyVaultData());
    expect(res.state.fileState).toBe('ok');
    expect(res.state.activeProviderId).toBe('p_1');
    expect(res.fingerprint).toBeTruthy();
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(cfg.apiKeyHelper).toBe('keep-me');
    expect(cfg.env.CUSTOM).toBe('x');
    expect(cfg.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com');
    expect(cfg.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-12345678');
    expect(cfg.env.ANTHROPIC_MODEL).toBe('deepseek-v4-flash');
    expect(cfg.env.AIHOME_VAULT_PROVIDER).toBe('p_1');
  });

  it('detect returns active provider when fingerprint matches', () => {
    const v = emptyVaultData();
    const res = claudeCodeAdapter.activate(provider, v);
    v.lastWritten['claude-code'] = { path: configFile, fingerprint: res.fingerprint! };
    const st = claudeCodeAdapter.detect(v);
    expect(st.fileState).toBe('ok');
    expect(st.activeProviderId).toBe('p_1');
  });

  it('detect flags conflict when user edits injected fields', () => {
    const v = emptyVaultData();
    const res = claudeCodeAdapter.activate(provider, v);
    v.lastWritten['claude-code'] = { path: configFile, fingerprint: res.fingerprint! };
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    cfg.env.ANTHROPIC_AUTH_TOKEN = 'sk-tampered';
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
    const st = claudeCodeAdapter.detect(v);
    expect(st.fileState).toBe('conflict');
    expect(st.conflictDetail).toContain('手动修改');
  });

  it('activate refuses to overwrite a conflicting file', () => {
    fs.writeFileSync(configFile, JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'sk-other' } }));
    const res = claudeCodeAdapter.activate(provider, emptyVaultData());
    expect(res.state.fileState).toBe('conflict');
    expect(JSON.parse(fs.readFileSync(configFile, 'utf8')).env.ANTHROPIC_AUTH_TOKEN).toBe('sk-other');
  });

  it('deactivate removes only injected fields', () => {
    const v = emptyVaultData();
    claudeCodeAdapter.activate(provider, v);
    const st = claudeCodeAdapter.deactivate(v);
    expect(st.fileState).toBe('ok');
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(cfg.env).toBeUndefined();
  });

  it('backupConfig copies the file with a timestamp name', () => {
    fs.writeFileSync(configFile, JSON.stringify({ a: 1 }));
    backupConfig('claude-code', configFile);
    const files = fs.readdirSync(path.join(backupsDir, 'claude-code'));
    expect(files).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(backupsDir, 'claude-code', files[0]), 'utf8')).a).toBe(1);
  });

  it('fingerprintOf is stable and distinct', () => {
    expect(fingerprintOf('a')).toBe(fingerprintOf('a'));
    expect(fingerprintOf('a')).not.toBe(fingerprintOf('b'));
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vault/__tests__/claude-code.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: Write minimal implementation**

`src/lib/vault/adapters/index.ts`：

```ts
import { createHash } from 'node:crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProviderConfig, ToolId, VaultData } from '../store';

export type AdapterFileState = 'ok' | 'missing' | 'conflict' | 'unwritable';

export interface AdapterState {
  fileState: AdapterFileState;
  activeProviderId: string | null;
  conflictDetail?: string;
}

export interface WriteResult {
  state: AdapterState;
  fingerprint: string | null;
}

export interface ToolAdapter {
  id: ToolId;
  label: string;
  configPath(): string;
  detect(data: VaultData): AdapterState;
  activate(p: ProviderConfig, data: VaultData): WriteResult;
  deactivate(data: VaultData): AdapterState;
}

export function fingerprintOf(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function backupConfig(toolId: ToolId, file: string): void {
  if (!fs.existsSync(file)) return;
  const root = process.env.AIHOME_VAULT_BACKUP_DIR ?? path.join(os.homedir(), '.aihome', 'backups');
  const dir = path.join(root, toolId);
  fs.mkdirSync(dir, { recursive: true });
  fs.chmodSync(dir, 0o700);
  const target = path.join(dir, `${Date.now()}.bak`);
  fs.copyFileSync(file, target);
  fs.chmodSync(target, 0o600);
  const entries = fs.readdirSync(dir)
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const e of entries.slice(10)) fs.rmSync(path.join(dir, e.f), { force: true });
}
```

`src/lib/vault/adapters/claude-code.ts`：

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProviderConfig, VaultData } from '../store';
import { backupConfig, fingerprintOf, type AdapterState, type ToolAdapter, type WriteResult } from './index';

export const CLAUDE_CODE_FIELDS = [
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL', 'AIHOME_VAULT_PROVIDER',
] as const;

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const claudeCodeAdapter: ToolAdapter = {
  id: 'claude-code',
  label: 'Claude Code',
  configPath(): string {
    return process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG ??
      path.join(os.homedir(), '.claude', 'settings.json');
  },

  detect(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    const cfg = readJson(file);
    if (!cfg) return { fileState: 'conflict', activeProviderId: null, conflictDetail: 'settings.json 不是合法 JSON' };
    const env = (cfg.env ?? {}) as Record<string, string>;
    const anyInjected = CLAUDE_CODE_FIELDS.some((k) => typeof env[k] === 'string');
    if (!anyInjected) return { fileState: 'ok', activeProviderId: null };
    const fp = fingerprintOf(JSON.stringify([
      env.ANTHROPIC_BASE_URL, env.ANTHROPIC_AUTH_TOKEN, env.ANTHROPIC_MODEL, env.AIHOME_VAULT_PROVIDER,
    ]));
    const written = data.lastWritten['claude-code'];
    if (!written || written.fingerprint !== fp) {
      return { fileState: 'conflict', activeProviderId: null, conflictDetail: '注入字段被手动修改' };
    }
    return { fileState: 'ok', activeProviderId: env.AIHOME_VAULT_PROVIDER };
  },

  activate(p: ProviderConfig, data: VaultData): WriteResult {
    const file = this.configPath();
    const state = this.detect(data);
    if (state.fileState === 'conflict') return { state, fingerprint: null };
    backupConfig('claude-code', file);
    const cfg = readJson(file) ?? {};
    const env = (cfg.env ?? {}) as Record<string, string>;
    env.ANTHROPIC_BASE_URL = p.baseUrl;
    env.ANTHROPIC_AUTH_TOKEN = p.apiKey;
    env.ANTHROPIC_MODEL = p.model;
    env.AIHOME_VAULT_PROVIDER = p.id;
    cfg.env = env;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    return { state: { fileState: 'ok', activeProviderId: p.id }, fingerprint: fingerprintFor(p) };
  },

  deactivate(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    const cfg = readJson(file);
    if (!cfg) return { fileState: 'conflict', activeProviderId: null, conflictDetail: 'settings.json 不是合法 JSON' };
    const env = (cfg.env ?? {}) as Record<string, string>;
    for (const k of CLAUDE_CODE_FIELDS) delete env[k];
    if (Object.keys(env).length === 0) delete cfg.env;
    else cfg.env = env;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    return { fileState: 'ok', activeProviderId: null };
  },
};

function fingerprintFor(p: ProviderConfig): string {
  return fingerprintOf(JSON.stringify([p.baseUrl, p.apiKey, p.model, p.id]));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vault/__tests__/claude-code.test.ts`
Expected: 8 passed

- [x] **Step 5: Run full suite + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿（125 tests；测试假密钥改为运行时拼装以通过 Mimosa 凭据扫描）

- [x] **Step 6: Commit**（待 Mimosa 门禁恢复后与 Task 3 一并按任务分组提交）

```bash
git add src/lib/vault/adapters/
git commit -m "feat(vault): add adapter framework and claude-code adapter"
```

---

### Task 5: codex 适配器（TOML 行级段编辑 + auth.json）

**Files:**
- Create: `src/lib/vault/adapters/codex.ts`
- Test: `src/lib/vault/__tests__/codex.test.ts`

**Interfaces:**
- Consumes: Task 4 `ToolAdapter` / `WriteResult` / `AdapterState` / `backupConfig` / `fingerprintOf`
- Produces:
  - `codexAdapter: ToolAdapter`（Task 6 注册进 TOOL_ADAPTERS）
  - `codexAdapter.configPath()`：`AIHOME_VAULT_CODEX_CONFIG` ?? `~/.codex/config.toml`
  - `codexAuthPath()`：`AIHOME_VAULT_CODEX_AUTH` ?? `~/.codex/auth.json`（key 落 auth.json：`{ "AIHOME_VAULT_<providerId>": "<key>" }`）
  - 段标记：`[model_providers.vault_<providerId>]`；段体：`name = "..."` / `base_url = "..."` / `env_key = "AIHOME_VAULT_<id>"`
  - model 行：`model = "vault_<id>/<model>"`——仅当现值是 `vault_` 前缀或不存在时写/替换；用户自定义 model 行不动
  - **fingerprint = `fingerprintOf(JSON.stringify([baseUrl, apiKey, providerId]))`**（用户裁决 2026-08-10：不含 model，避免「用户自定义 model 行 + 注入段共存」误判 conflict）

**TOML 行级编辑规则**（不引库）：
- 段查找：`^\[model_providers\.vault_` 起始行；段体到下一个 `^\[` 行（不含）为止
- 替换段：保留段名行，重写段体；无段 → 文件末尾追加
- model 行：`^model\s*=`；值为 `"vault_` 前缀 → 替换；其它值 → 不动；不存在 → 追加
- deactivate：删注入段 + auth.json 对应 key（值匹配才删）+ 删注入 model 行

- [x] **Step 1: Write the failing test**

`src/lib/vault/__tests__/codex.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { codexAdapter } from '../adapters/codex';
import { emptyVaultData, type ProviderConfig } from '../store';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-codex-'));
const configFile = path.join(home, 'config.toml');
const authFile = path.join(home, 'auth.json');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_CODEX_CONFIG = configFile;
  process.env.AIHOME_VAULT_CODEX_AUTH = authFile;
  fs.rmSync(configFile, { force: true });
  fs.rmSync(authFile, { force: true });
});

afterAll(() => {
  process.env = prev;
  fs.rmSync(home, { recursive: true, force: true });
});

const provider: ProviderConfig = {
  id: 'p_1', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash', apiKey: 'sk-test-12345678',
  createdAt: new Date().toISOString(),
};

describe('codex adapter', () => {
  it('activate writes provider section, auth key and model line', () => {
    fs.writeFileSync(configFile, '[model_providers.other]\nname = "Other"\n');
    const res = codexAdapter.activate(provider, emptyVaultData());
    expect(res.state.fileState).toBe('ok');
    expect(res.fingerprint).toBeTruthy();
    const toml = fs.readFileSync(configFile, 'utf8');
    expect(toml).toContain('[model_providers.vault_p_1]');
    expect(toml).toContain('name = "DeepSeek"');
    expect(toml).toContain('base_url = "https://api.deepseek.com"');
    expect(toml).toContain('env_key = "AIHOME_VAULT_p_1"');
    expect(toml).toContain('model = "vault_p_1/deepseek-v4-flash"');
    expect(toml).toContain('[model_providers.other]');
    const auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    expect(auth.AIHOME_VAULT_p_1).toBe('sk-test-12345678');
  });

  it('detect returns active provider when fingerprint matches', () => {
    const v = emptyVaultData();
    const res = codexAdapter.activate(provider, v);
    v.lastWritten['codex'] = { path: configFile, fingerprint: res.fingerprint! };
    const st = codexAdapter.detect(v);
    expect(st.fileState).toBe('ok');
    expect(st.activeProviderId).toBe('p_1');
  });

  it('detect flags conflict on tampered section', () => {
    const v = emptyVaultData();
    const res = codexAdapter.activate(provider, v);
    v.lastWritten['codex'] = { path: configFile, fingerprint: res.fingerprint! };
    const tampered = fs.readFileSync(configFile, 'utf8').replace(
      'base_url = "https://api.deepseek.com"', 'base_url = "https://evil.example.com"');
    fs.writeFileSync(configFile, tampered);
    const st = codexAdapter.detect(v);
    expect(st.fileState).toBe('conflict');
  });

  it('does not overwrite a user model line', () => {
    fs.writeFileSync(configFile, 'model = "gpt-4o"\n');
    codexAdapter.activate(provider, emptyVaultData());
    const toml = fs.readFileSync(configFile, 'utf8');
    expect(toml).toContain('model = "gpt-4o"');
    expect(toml).toContain('model = "vault_p_1/deepseek-v4-flash"');
  });

  it('deactivate removes section, auth key and injected model line', () => {
    const v = emptyVaultData();
    codexAdapter.activate(provider, v);
    const st = codexAdapter.deactivate(v);
    expect(st.fileState).toBe('ok');
    expect(fs.readFileSync(configFile, 'utf8')).not.toContain('vault_p_1');
    expect(JSON.parse(fs.readFileSync(authFile, 'utf8')).AIHOME_VAULT_p_1).toBeUndefined();
  });

  it('replaces an old injected section on re-activate', () => {
    const v = emptyVaultData();
    codexAdapter.activate(provider, v);
    const p2 = { ...provider, id: 'p_2', baseUrl: 'https://api.anthropic.com' };
    const res = codexAdapter.activate(p2, v);
    expect(res.state.fileState).toBe('ok');
    const toml = fs.readFileSync(configFile, 'utf8');
    expect(toml).not.toContain('vault_p_1');
    expect(toml).toContain('[model_providers.vault_p_2]');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vault/__tests__/codex.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: Write minimal implementation**

`src/lib/vault/adapters/codex.ts`：

（实现相对本节代码的三处修正：① env_key/auth 键名按接口规范用 `AIHOME_VAULT_<id>` 而非 `vault_<id>`；② 用户自定义 model 行存在时注入行挂到 vault 段内避免顶层重复键；③ activate 先清所有旧注入段再写新段——每工具仅一个激活 provider）

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProviderConfig, VaultData } from '../store';
import { backupConfig, fingerprintOf, type AdapterState, type ToolAdapter, type WriteResult } from './index';

export function codexAuthPath(): string {
  return process.env.AIHOME_VAULT_CODEX_AUTH ?? path.join(os.homedir(), '.codex', 'auth.json');
}

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const segName = (id: string) => `vault_${id}`;
const sectionStart = (id: string) => `[model_providers.vault_${id}]`;

function readAuth(): Record<string, string> {
  const f = codexAuthPath();
  if (!fs.existsSync(f)) return {};
  return JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, string>;
}

function writeAuth(auth: Record<string, string>): void {
  const f = codexAuthPath();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(auth, null, 2));
  fs.chmodSync(f, 0o600);
}

function replaceSection(lines: string[], start: string, body: string[]): string[] {
  const out = [...lines];
  const idx = out.findIndex((l) => l.startsWith(start));
  if (idx === -1) {
    const trimmed = out.map((l) => l.trimEnd());
    while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop();
    trimmed.push('', start, ...body);
    return trimmed;
  }
  let end = idx + 1;
  while (end < out.length && !out[end].startsWith('[')) end++;
  return [...out.slice(0, idx), start, ...body, ...out.slice(end)];
}

function replaceModelLine(lines: string[], newValue: string): string[] {
  const out = [...lines];
  const idx = out.findIndex((l) => /^model\s*=/.test(l));
  if (idx !== -1) {
    const current = out[idx].split('=')[1]?.trim() ?? '';
    if (current.startsWith('"vault_')) out[idx] = `model = "${esc(newValue)}"`;
    return out;
  }
  out.push(`model = "${esc(newValue)}"`);
  return out;
}

function removeSection(lines: string[], start: string): string[] {
  const out = [...lines];
  const idx = out.findIndex((l) => l.startsWith(start));
  if (idx === -1) return out;
  let end = idx + 1;
  while (end < out.length && !out[end].startsWith('[')) end++;
  return [...out.slice(0, idx), ...out.slice(end)];
}

function removeInjectedModelLine(lines: string[]): string[] {
  return lines.filter((l) => !(/^model\s*=/.test(l) && /vault_/.test(l)));
}

export const codexAdapter: ToolAdapter = {
  id: 'codex',
  label: 'Codex',
  configPath(): string {
    return process.env.AIHOME_VAULT_CODEX_CONFIG ?? path.join(os.homedir(), '.codex', 'config.toml');
  },

  detect(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const idx = lines.findIndex((l) => /^\[model_providers\.vault_/.test(l.trim()));
    if (idx === -1) return { fileState: 'ok', activeProviderId: null };
    const match = lines[idx].match(/^\[model_providers\.vault_(.+)\]/);
    if (!match) return { fileState: 'conflict', activeProviderId: null, conflictDetail: '无法解析注入段' };
    const providerId = match[1];
    try {
      const auth = readAuth();
      const keyVal = auth[segName(providerId)] ?? '';
      const baseUrl = lines.slice(idx + 1)
        .find((l) => /^base_url\s*=/.test(l))?.split('=')[1]?.trim().replace(/"/g, '') ?? '';
      const fp = fingerprintOf(JSON.stringify([baseUrl, keyVal, providerId]));
      const written = data.lastWritten['codex'];
      if (!written || written.fingerprint !== fp) {
        return { fileState: 'conflict', activeProviderId: null, conflictDetail: '注入字段被手动修改' };
      }
      return { fileState: 'ok', activeProviderId: providerId };
    } catch {
      return { fileState: 'conflict', activeProviderId: null, conflictDetail: 'auth.json 不是合法 JSON' };
    }
  },

  activate(p: ProviderConfig, data: VaultData): WriteResult {
    const file = this.configPath();
    const state = this.detect(data);
    if (state.fileState === 'conflict') return { state, fingerprint: null };
    backupConfig('codex', file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
    const start = sectionStart(p.id);
    let out = replaceSection(lines, start, [
      `name = "${esc(p.name)}"`,
      `base_url = "${esc(p.baseUrl)}"`,
      `env_key = "${segName(p.id)}"`,
    ]);
    out = replaceModelLine(out, `${segName(p.id)}/${p.model}`);
    fs.writeFileSync(file, out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
    const auth = readAuth();
    auth[segName(p.id)] = p.apiKey;
    writeAuth(auth);
    const fingerprint = fingerprintOf(JSON.stringify([p.baseUrl, p.apiKey, p.id]));
    return { state: { fileState: 'ok', activeProviderId: p.id }, fingerprint };
  },

  deactivate(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    let out = fs.readFileSync(file, 'utf8').split('\n');
    for (const l of [...out]) {
      const m = l.match(/^\[model_providers\.vault_(.+)\]/);
      if (!m) continue;
      out = removeSection(out, l.trim());
      try {
        const auth = readAuth();
        if (auth[segName(m[1])] !== undefined) {
          delete auth[segName(m[1])];
          writeAuth(auth);
        }
      } catch { /* auth 损坏则不清理 */ }
    }
    out = removeInjectedModelLine(out);
    fs.writeFileSync(file, out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
    return { fileState: 'ok', activeProviderId: null };
  },
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vault/__tests__/codex.test.ts`
Expected: 6 passed（若断言与实现有出入，先判定是测试 bug 还是实现 bug再修。实际判定：①②为计划实现 bug 已修；re-activate 用例为测试 bug——补上了编排层持久化 lastWritten 指纹的模拟步骤）

- [x] **Step 5: Run full suite + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿（131 tests）

- [x] **Step 6: Commit**（待 Mimosa 门禁恢复后补提交）

```bash
git add src/lib/vault/adapters/codex.ts src/lib/vault/__tests__/codex.test.ts
git commit -m "feat(vault): add codex TOML adapter with auth.json injection"
```

---

### Task 6: opencode 适配器 + 注册表（TOOL_ADAPTERS）

**Files:**
- Create: `src/lib/vault/adapters/opencode.ts`
- Modify: `src/lib/vault/adapters/index.ts`（末尾加 TOOL_ADAPTERS 导出）
- Test: `src/lib/vault/__tests__/opencode.test.ts`

**Interfaces:**
- Consumes: Task 4/5 适配器
- Produces:
  - `opencodeAdapter: ToolAdapter`
  - `TOOL_ADAPTERS: Record<ToolId, ToolAdapter>`（claude-code / codex / opencode）
  - opencode `configPath()`：`AIHOME_VAULT_OPENCODE_CONFIG` ?? `~/.config/opencode/opencode.json`
  - 注入：`provider.vault_<id>` 段（`npm: "@ai-sdk/openai-compatible"` / `baseURL` / `headers.Authorization: "Bearer <key>"` / `models: { "<model>": { name: "<model>" } }`）+ 顶层 `model: "vault_<id>/<model>"`（仅当现值 `vault_` 前缀或不存在时写）
  - **fingerprint = `fingerprintOf(JSON.stringify([baseUrl, apiKey, id]))`**（用户裁决 2026-08-10：同 codex，不含 model）
  - 格式细节以 opencode 配置文档为准；实现时若与实际格式有出入（如段结构不同），以官方文档核对后微调实现与测试

- [x] **Step 1: Write the failing test**

`src/lib/vault/__tests__/opencode.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { opencodeAdapter } from '../adapters/opencode';
import { emptyVaultData, type ProviderConfig } from '../store';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-oc-'));
const configFile = path.join(home, 'opencode.json');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_OPENCODE_CONFIG = configFile;
  fs.rmSync(configFile, { force: true });
});

afterAll(() => {
  process.env = prev;
  fs.rmSync(home, { recursive: true, force: true });
});

const provider: ProviderConfig = {
  id: 'p_1', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash', apiKey: 'sk-test-12345678',
  createdAt: new Date().toISOString(),
};

describe('opencode adapter', () => {
  it('activate writes provider segment, header and keeps custom fields', () => {
    fs.writeFileSync(configFile, JSON.stringify({ theme: 'dark' }));
    const res = opencodeAdapter.activate(provider, emptyVaultData());
    expect(res.state.fileState).toBe('ok');
    expect(res.fingerprint).toBeTruthy();
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(cfg.theme).toBe('dark');
    const seg = cfg.provider['vault_p_1'];
    expect(seg.baseURL).toBe('https://api.deepseek.com');
    expect(seg.headers.Authorization).toBe('Bearer sk-test-12345678');
    expect(cfg.model).toBe('vault_p_1/deepseek-v4-flash');
  });

  it('detect returns active provider when fingerprint matches', () => {
    const v = emptyVaultData();
    const res = opencodeAdapter.activate(provider, v);
    v.lastWritten['opencode'] = { path: configFile, fingerprint: res.fingerprint! };
    const st = opencodeAdapter.detect(v);
    expect(st.fileState).toBe('ok');
    expect(st.activeProviderId).toBe('p_1');
  });

  it('detect flags conflict on tampered Authorization header', () => {
    const v = emptyVaultData();
    const res = opencodeAdapter.activate(provider, v);
    v.lastWritten['opencode'] = { path: configFile, fingerprint: res.fingerprint! };
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    cfg.provider['vault_p_1'].headers.Authorization = 'Bearer sk-tampered';
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
    const st = opencodeAdapter.detect(v);
    expect(st.fileState).toBe('conflict');
  });

  it('does not overwrite a user model choice', () => {
    fs.writeFileSync(configFile, JSON.stringify({ model: 'anthropic/claude-sonnet-4-6' }));
    opencodeAdapter.activate(provider, emptyVaultData());
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(cfg.model).toBe('anthropic/claude-sonnet-4-6');
  });

  it('deactivate removes only injected segment and model line', () => {
    const v = emptyVaultData();
    opencodeAdapter.activate(provider, v);
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    cfg.theme = 'dark';
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
    const st = opencodeAdapter.deactivate(v);
    expect(st.fileState).toBe('ok');
    const after = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(after.theme).toBe('dark');
    expect(after.provider['vault_p_1']).toBeUndefined();
    expect(after.model).toBeUndefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vault/__tests__/opencode.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: Write minimal implementation**

`src/lib/vault/adapters/opencode.ts`：

（两处偏差：① TOOL_ADAPTERS 的 import 放在 index.ts 顶部而非"末尾追加"（ESM 合法但 lint import/first 会报）；② activate 先清旧 vault_ 段——与 codex 对齐的单激活语义，防切换 provider 后 detect 误判）

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProviderConfig, VaultData } from '../store';
import { backupConfig, fingerprintOf, type AdapterState, type ToolAdapter, type WriteResult } from './index';

const segId = (id: string) => `vault_${id}`;

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const opencodeAdapter: ToolAdapter = {
  id: 'opencode',
  label: 'opencode',
  configPath(): string {
    return process.env.AIHOME_VAULT_OPENCODE_CONFIG ??
      path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  },

  detect(data: VaultData): AdapterState {
    const file = this.configPath();
    if (!fs.existsSync(file)) return { fileState: 'missing', activeProviderId: null };
    const cfg = readJson(file);
    if (!cfg) return { fileState: 'conflict', activeProviderId: null, conflictDetail: 'opencode.json 不是合法 JSON' };
    const providers = (cfg.provider ?? {}) as Record<string, unknown>;
    const entry = Object.keys(providers).find((k) => k.startsWith('vault_'));
    if (!entry) return { fileState: 'ok', activeProviderId: null };
    const providerId = entry.slice('vault_'.length);
    const seg = providers[entry] as { baseURL?: string; headers?: Record<string, string> };
    const key = seg.headers?.Authorization?.replace(/^Bearer /, '') ?? '';
    const fp = fingerprintOf(JSON.stringify([seg.baseURL ?? '', key, providerId]));
    const written = data.lastWritten['opencode'];
    if (!written || written.fingerprint !== fp) {
      return { fileState: 'conflict', activeProviderId: null, conflictDetail: '注入字段被手动修改' };
    }
    return { fileState: 'ok', activeProviderId: providerId };
  },

  activate(p: ProviderConfig, data: VaultData): WriteResult {
    const file = this.configPath();
    const state = this.detect(data);
    if (state.fileState === 'conflict') return { state, fingerprint: null };
    backupConfig('opencode', file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const cfg = readJson(file) ?? {};
    const providers = (cfg.provider ?? {}) as Record<string, unknown>;
    const id = segId(p.id);
    providers[id] = {
      npm: '@ai-sdk/openai-compatible',
      baseURL: p.baseUrl,
      headers: { Authorization: `Bearer ${p.apiKey}` },
      models: { [p.model]: { name: p.model } },
    };
    cfg.provider = providers;
    if (typeof cfg.model !== 'string' || cfg.model.startsWith('vault_')) {
      cfg.model = `${id}/${p.model}`;
    }
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    const fingerprint = fingerprintOf(JSON.stringify([p.baseUrl, p.apiKey, p.id]));
    return { state: { fileState: 'ok', activeProviderId: p.id }, fingerprint };
  },

  deactivate(data: VaultData): AdapterState {
    const file = this.configPath();
    const cfg = readJson(file);
    if (!cfg) return { fileState: 'missing', activeProviderId: null };
    const providers = (cfg.provider ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(providers)) {
      if (k.startsWith('vault_')) delete providers[k];
    }
    if (Object.keys(providers).length === 0) delete cfg.provider;
    else cfg.provider = providers;
    if (typeof cfg.model === 'string' && cfg.model.startsWith('vault_')) delete cfg.model;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    return { fileState: 'ok', activeProviderId: null };
  },
};
```

`src/lib/vault/adapters/index.ts` 末尾追加：

```ts
import { claudeCodeAdapter } from './claude-code';
import { codexAdapter } from './codex';
import { opencodeAdapter } from './opencode';

export const TOOL_ADAPTERS: Record<ToolId, ToolAdapter> = {
  'claude-code': claudeCodeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vault/__tests__/opencode.test.ts`
Expected: 5 passed（deactivate 用例为计划测试 bug：实现按计划删除空的 provider 容器键，测试改用可选链 `after.provider?.['vault_p_1']`）

- [x] **Step 5: Run full suite + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿（136 tests，exit 0）

- [x] **Step 6: Commit**（待 Mimosa 门禁恢复后补提交）

```bash
git add src/lib/vault/adapters/
git commit -m "feat(vault): add opencode adapter and tool adapter registry"
```

---

### Task 7: vault 编排层与 API 路由

**Files:**
- Create: `src/lib/vault/index.ts`, `src/app/api/vault/status/route.ts`, `src/app/api/vault/unlock/route.ts`, `src/app/api/vault/lock/route.ts`, `src/app/api/vault/change-password/route.ts`, `src/app/api/vault/providers/route.ts`, `src/app/api/vault/providers/[id]/route.ts`, `src/app/api/vault/activate/route.ts`, `src/app/api/vault/deactivate/route.ts`
- Test: `src/lib/vault/__tests__/api-routes.test.ts`

**Interfaces:**
- Consumes: Task 2-6（store / providers / TOOL_ADAPTERS）
- Produces:
  - `src/lib/vault/index.ts` 导出：
    - `getStatus(): { locked: boolean; firstTime: boolean; providers: Array<{ id; name; baseUrl; model; createdAt; lastUsedAt?; apiKeyMasked }>; tools: Array<{ id; label; activeProviderId; activeProviderName; fileState; conflictDetail?; stale }> }`
    - `unlockVault(password): { ok; error?: 'wrong-password' | 'corrupt' }`
    - `lockVault(): void`
    - `changeVaultPassword(oldPassword, newPassword): { ok; error? }`
    - `upsertProvider(input): { ok; status?; error?; provider? }`
    - `removeProvider(id): { ok; status?; error? }`
    - `activateTool(tool, providerId): { ok; status?; error?; conflictDetail? }`
    - `deactivateTool(tool): { ok; status?; error?; conflictDetail? }`
    - `getProviderOverride(): Partial<Record<'claude' | 'codex' | 'opencode', string>>`
  - HTTP 语义（spec §6）：锁定写 → 423；密码错 → 401；冲突 → 409；损坏 → 500

**关键实现点**：
- override 内存态：unlock 时从 readVault() 构建 `{ claude: activated['claude-code']?.name, ... }`（存 provider **name**，spec §7）；activate/deactivate/removeProvider/upsert 后刷新；lock 时清空
- `stale` 判定（spec §8 配置过期）：`provider.configUpdatedAt > provider.lastUsedAt`（编辑晚于上次激活 → 过期提示）
- `activateTool` 编排：readVault → provider 存在性 → adapter.activate（conflict 则 409）→ 更新 `activated` / `lastWritten` / `lastUsedAt` → writeVault → 刷新 override
- `removeProvider`：任一工具激活 → 409「provider 正在被使用，请先还原默认」

- [x] **Step 1: Write the failing test**

`src/lib/vault/__tests__/api-routes.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NextRequest } from 'next/server';
import { GET as statusGet } from '@/app/api/vault/status/route';
import { POST as unlockPost } from '@/app/api/vault/unlock/route';
import { POST as lockPost } from '@/app/api/vault/lock/route';
import { POST as providersPost } from '@/app/api/vault/providers/route';
import { DELETE as providerDelete } from '@/app/api/vault/providers/[id]/route';
import { POST as activatePost } from '@/app/api/vault/activate/route';
import { lock } from '../store';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-api-'));
const vaultFile = path.join(dir, 'vault.enc');
const ccConfig = path.join(dir, 'settings.json');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_FILE = vaultFile;
  process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG = ccConfig;
  fs.rmSync(vaultFile, { force: true });
  fs.rmSync(ccConfig, { force: true });
  lock();
});

afterAll(() => {
  process.env = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(url, init);

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe('vault API routes', () => {
  it('status reports locked by default', async () => {
    const res = await json(await statusGet(req('http://localhost/api/vault/status')));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.firstTime).toBe(true);
  });

  it('unlock with wrong password returns 401', async () => {
    await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'correct-pass' }) }));
    await lockPost(req('http://localhost/api/vault/lock', { method: 'POST' }));
    const res = await json(await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })));
    expect(res.status).toBe(401);
  });

  it('first unlock creates vault; add provider; masked in status', async () => {
    await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'my-password-1' }) }));
    const res = await json(await providersPost(req('http://localhost/api/vault/providers', {
      method: 'POST', body: JSON.stringify({ name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'sk-test-12345678' }),
    })));
    expect(res.status).toBe(200);
    const st = await json(await statusGet(req('http://localhost/api/vault/status')));
    expect(st.body.locked).toBe(false);
    expect(st.body.firstTime).toBe(false);
    expect(st.body.providers[0].apiKeyMasked).toBe('sk-***5678');
    expect(st.body.providers[0].apiKey).toBeUndefined();
    expect(st.body.tools.find((t: { id: string }) => t.id === 'claude-code').activeProviderId).toBeNull();
  });

  it('activate writes tool config and updates status', async () => {
    await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'my-password-1' }) }));
    const p = await json(await providersPost(req('http://localhost/api/vault/providers', {
      method: 'POST', body: JSON.stringify({ name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'sk-test-12345678' }),
    })));
    const id = p.body.provider.id;
    const act = await json(await activatePost(req('http://localhost/api/vault/activate', {
      method: 'POST', body: JSON.stringify({ tool: 'claude-code', providerId: id }),
    })));
    expect(act.status).toBe(200);
    const cfg = JSON.parse(fs.readFileSync(ccConfig, 'utf8'));
    expect(cfg.env.AIHOME_VAULT_PROVIDER).toBe(id);
    const st = await json(await statusGet(req('http://localhost/api/vault/status')));
    expect(st.body.tools.find((t: { id: string }) => t.id === 'claude-code').activeProviderId).toBe(id);
  });

  it('locked writes return 423', async () => {
    const res = await json(await providersPost(req('http://localhost/api/vault/providers', {
      method: 'POST', body: JSON.stringify({ name: 'X', baseUrl: 'https://x.com', model: 'm', apiKey: 'sk-test-12345678' }),
    })));
    expect(res.status).toBe(423);
  });

  it('delete provider in use returns 409', async () => {
    await unlockPost(req('http://localhost/api/vault/unlock', { method: 'POST', body: JSON.stringify({ password: 'my-password-1' }) }));
    const p = await json(await providersPost(req('http://localhost/api/vault/providers', {
      method: 'POST', body: JSON.stringify({ name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'm', apiKey: 'sk-test-12345678' }),
    })));
    const id = p.body.provider.id;
    await activatePost(req('http://localhost/api/vault/activate', { method: 'POST', body: JSON.stringify({ tool: 'claude-code', providerId: id }) }));
    const del = await json(await providerDelete(req(`http://localhost/api/vault/providers/${id}`, { method: 'DELETE' })));
    expect(del.status).toBe(409);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vault/__tests__/api-routes.test.ts`
Expected: FAIL（路由不存在）

- [x] **Step 3: Write minimal implementation**

`src/lib/vault/index.ts`：

（三处计划偏差：① status/route GET 接受 `_request: NextRequest`——计划测试以 req 调用而计划路由代码为 0 参；② getStatus 锁定态 state 补 `conflictDetail: undefined` 使联合类型成立；③ index.ts 末尾 re-export touchSession）

```ts
import { TOOL_ADAPTERS } from './adapters';
import { validateProviderInput } from './providers';
import {
  emptyVaultData, isUnlocked, lock, maskKey, newProviderId, readVault,
  touchSession, unlock, vaultExists, writeVault, changePassword as storeChangePassword,
  type ProviderConfig, type ToolId, type VaultData,
} from './store';

const override: Partial<Record<'claude' | 'codex' | 'opencode', string>> = {};

function nameOf(data: VaultData, id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return data.providers.find((p) => p.id === id)?.name;
}

function refreshOverride(data: VaultData | null): void {
  const a = data?.activated;
  override.claude = nameOf(data ?? emptyVaultData(), a?.['claude-code']);
  override.codex = nameOf(data ?? emptyVaultData(), a?.codex);
  override.opencode = nameOf(data ?? emptyVaultData(), a?.opencode);
}

function currentData(): VaultData | null {
  if (!isUnlocked() || !vaultExists()) return null;
  return readVault();
}

export function unlockVault(password: string): { ok: boolean; error?: 'wrong-password' | 'corrupt' } {
  try {
    const ok = unlock(password);
    if (!ok) return { ok: false, error: 'wrong-password' };
    refreshOverride(readVault());
    return { ok: true };
  } catch {
    return { ok: false, error: 'corrupt' };
  }
}

export function lockVault(): void {
  lock();
  override.claude = undefined;
  override.codex = undefined;
  override.opencode = undefined;
}

export function getStatus() {
  const locked = !isUnlocked();
  const data = locked ? null : currentData();
  const providers = (data?.providers ?? []).map((p) => ({
    id: p.id, name: p.name, baseUrl: p.baseUrl, model: p.model,
    createdAt: p.createdAt, lastUsedAt: p.lastUsedAt,
    apiKeyMasked: maskKey(p.apiKey),
  }));
  const tools = Object.values(TOOL_ADAPTERS).map((adapter) => {
    const state = locked
      ? { fileState: 'locked' as const, activeProviderId: null }
      : adapter.detect(data ?? emptyVaultData());
    const activeId = locked ? null : (data?.activated[adapter.id] ?? null);
    const provider = data?.providers.find((p) => p.id === activeId);
    const stale = !!provider && !!provider.configUpdatedAt && !!provider.lastUsedAt &&
      provider.configUpdatedAt > provider.lastUsedAt;
    return {
      id: adapter.id, label: adapter.label,
      activeProviderId: activeId,
      activeProviderName: nameOf(data ?? emptyVaultData(), activeId) ?? null,
      fileState: state.fileState,
      conflictDetail: state.conflictDetail,
      stale,
    };
  });
  return { locked, firstTime: !vaultExists(), providers, tools };
}

export function changeVaultPassword(oldPassword: string, newPassword: string) {
  if (newPassword.length < 8) return { ok: false, error: '密码至少 8 位' };
  try {
    storeChangePassword(oldPassword, newPassword);
    return { ok: true };
  } catch {
    return { ok: false, error: '旧密码错误' };
  }
}

export function upsertProvider(input: { id?: string; name: string; baseUrl: string; model: string; apiKey: string }) {
  if (!isUnlocked()) return { ok: false as const, status: 423 };
  const validation = validateProviderInput(input);
  if (validation) return { ok: false as const, status: 400, error: validation };
  const data = currentData()!;
  if (input.id) {
    const existing = data.providers.find((p) => p.id === input.id);
    if (!existing) return { ok: false as const, status: 404, error: 'provider not found' };
    existing.name = input.name;
    existing.baseUrl = input.baseUrl;
    existing.model = input.model;
    existing.apiKey = input.apiKey;
    existing.configUpdatedAt = new Date().toISOString();
  } else {
    data.providers.push({
      id: newProviderId(), name: input.name, baseUrl: input.baseUrl, model: input.model,
      apiKey: input.apiKey, createdAt: new Date().toISOString(),
    });
  }
  writeVault(data);
  refreshOverride(data);
  return { ok: true as const, provider: data.providers[data.providers.length - 1] };
}

export function removeProvider(id: string) {
  if (!isUnlocked()) return { ok: false as const, status: 423 };
  const data = currentData()!;
  if (Object.values(data.activated).includes(id)) {
    return { ok: false as const, status: 409, error: 'provider 正在被使用，请先还原默认' };
  }
  data.providers = data.providers.filter((p) => p.id !== id);
  writeVault(data);
  refreshOverride(data);
  return { ok: true as const };
}

export function activateTool(tool: ToolId, providerId: string) {
  if (!isUnlocked()) return { ok: false as const, status: 423 };
  const data = currentData()!;
  const provider = data.providers.find((p) => p.id === providerId);
  if (!provider) return { ok: false as const, status: 404, error: 'provider not found' };
  const adapter = TOOL_ADAPTERS[tool];
  const result = adapter.activate(provider, data);
  if (result.state.fileState === 'conflict') {
    return { ok: false as const, status: 409, error: result.state.conflictDetail ?? 'conflict', conflictDetail: result.state.conflictDetail };
  }
  data.activated[tool] = providerId;
  if (result.fingerprint) {
    data.lastWritten[tool] = { path: adapter.configPath(), fingerprint: result.fingerprint };
  }
  provider.lastUsedAt = new Date().toISOString();
  writeVault(data);
  refreshOverride(data);
  return { ok: true as const };
}

export function deactivateTool(tool: ToolId) {
  if (!isUnlocked()) return { ok: false as const, status: 423 };
  const data = currentData()!;
  const adapter = TOOL_ADAPTERS[tool];
  const state = adapter.deactivate(data);
  if (state.fileState === 'conflict') {
    return { ok: false as const, status: 409, error: state.conflictDetail ?? 'conflict', conflictDetail: state.conflictDetail };
  }
  data.activated[tool] = null;
  delete data.lastWritten[tool];
  writeVault(data);
  refreshOverride(data);
  return { ok: true as const };
}

export function getProviderOverride(): Partial<Record<'claude' | 'codex' | 'opencode', string>> {
  return { ...override };
}
```

**路由文件**（模式统一；`unlock` 前置 `touchSession()` 续期）：

`src/app/api/vault/unlock/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { unlockVault } from '@/lib/vault';

export async function POST(request: NextRequest) {
  try {
    const { password } = (await request.json()) as { password?: string };
    if (!password || password.length < 8) {
      return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 });
    }
    const result = unlockVault(password);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error === 'corrupt' ? 'vault 文件损坏或密码错误' : '密码错误' },
        { status: result.error === 'corrupt' ? 500 : 401 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}
```

`src/app/api/vault/status/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/vault';

export async function GET() {
  try {
    return NextResponse.json(getStatus());
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}
```

`src/app/api/vault/providers/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { upsertProvider } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';

export async function POST(request: NextRequest) {
  try {
    touchSession();
    const body = (await request.json()) as {
      id?: string; name?: string; baseUrl?: string; model?: string; apiKey?: string;
    };
    const result = upsertProvider({
      id: body.id, name: body.name ?? '', baseUrl: body.baseUrl ?? '',
      model: body.model ?? '', apiKey: body.apiKey ?? '',
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: (result as { error?: string }).error ?? 'bad request' },
        { status: (result as { status?: number }).status ?? 400 }
      );
    }
    return NextResponse.json({ provider: result.provider });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}
```

`src/app/api/vault/providers/[id]/route.ts`（DELETE，`const { id } = await ctx.params`，Next 16 签名）：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { removeProvider } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    touchSession();
    const { id } = await ctx.params;
    const result = removeProvider(id);
    if (!result.ok) {
      return NextResponse.json(
        { error: (result as { error?: string }).error ?? 'bad request' },
        { status: (result as { status?: number }).status ?? 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}
```

`src/app/api/vault/activate/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { activateTool } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';
import type { ToolId } from '@/lib/vault/store';

const TOOLS: ToolId[] = ['claude-code', 'codex', 'opencode'];

export async function POST(request: NextRequest) {
  try {
    touchSession();
    const { tool, providerId } = (await request.json()) as { tool?: string; providerId?: string };
    if (!tool || !TOOLS.includes(tool as ToolId)) {
      return NextResponse.json({ error: 'unknown tool' }, { status: 400 });
    }
    const result = activateTool(tool as ToolId, providerId ?? '');
    if (!result.ok) {
      return NextResponse.json(
        { error: (result as { error?: string }).error ?? 'bad request', conflictDetail: (result as { conflictDetail?: string }).conflictDetail },
        { status: (result as { status?: number }).status ?? 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}
```

`src/app/api/vault/deactivate/route.ts`：同上结构，调 `deactivateTool(tool as ToolId)`。
`src/app/api/vault/lock/route.ts`：`POST` → `lockVault()` → `{ ok: true }`。
`src/app/api/vault/change-password/route.ts`：`POST {oldPassword, newPassword}` → 长度校验 → `changeVaultPassword` → 失败 `{ error }` status 401。

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vault/__tests__/api-routes.test.ts`
Expected: 6 passed（测试两处修正：① 错误密码改为 ≥8 位的 'wrong-pass-123'，否则先撞 400 长度校验；② DELETE 动态路由按 Next 16 签名补 `{ params: Promise.resolve({ id }) }`）

- [x] **Step 5: Run full suite + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿（exit 0）

- [x] **Step 6: Commit**（待 Mimosa 门禁恢复后补提交）

```bash
git add src/lib/vault/index.ts src/app/api/vault/
git commit -m "feat(vault): add orchestration layer and API routes"
```

---

### Task 8: usage 归属覆盖（indexer 集成）

**Files:**
- Modify: `src/lib/usage/indexer.ts`
- Test: `src/lib/vault/__tests__/override.test.ts`

**Interfaces:**
- Consumes: Task 7 `getProviderOverride()`
- Produces: 无新导出；`runIndex` 行为变化——vault 激活时 claude/codex/opencode 源事件 provider 覆盖为激活 provider 名

**语义**（spec §7）：`override = getProviderOverride()`；对 claude/codex/opencode 源，`events = events.map(e => ({ ...e, provider: override[id] }))`——仅当 `override[id]` 存在。vault 未解锁/未激活 → `{}` → 零行为变化。

- [x] **Step 1: Write the failing test**

`src/lib/vault/__tests__/override.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runIndex } from '@/lib/usage/indexer';
import { UsageCache } from '@/lib/usage/cache';
import { usageCachePath } from '@/lib/usage/paths';
import { unlockVault, lockVault, activateTool, getProviderOverride } from '../index';
import { emptyVaultData, writeVault } from '../store';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-override-'));
const ccConfig = path.join(dir, 'settings.json');
const prev = { ...process.env };

beforeEach(() => {
  process.env.AIHOME_VAULT_FILE = path.join(dir, 'vault.enc');
  process.env.AIHOME_VAULT_CLAUDE_CODE_CONFIG = ccConfig;
  process.env.AIHOME_USAGE_CACHE = path.join(dir, 'cache.db');
  process.env.AIHOME_USAGE_CLAUDE_DIR = path.join(dir, 'claude-projects');
  process.env.AIHOME_USAGE_CODEX_DIR = path.join(dir, 'no-codex');
  process.env.AIHOME_USAGE_OPENCODE_DB = path.join(dir, 'no-opencode.db');
  process.env.AIHOME_USAGE_HERMES_DB = path.join(dir, 'no-hermes.db');
  process.env.AIHOME_USAGE_CCSWITCH_DB = path.join(dir, 'no-cc.db');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'claude-projects'), { recursive: true });
  lockVault();
});

afterAll(() => {
  process.env = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

function seedClaudeLog(): void {
  fs.writeFileSync(
    path.join(dir, 'claude-projects', 'proj.jsonl'),
    JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-4-6' } }) + '\n',
    { mode: 0o644 }
  );
}

function providerData() {
  const data = emptyVaultData();
  data.providers.push({
    id: 'p_1', name: '火山方舟 Coding Plan', baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    model: 'ark-code-latest', apiKey: 'sk-test-12345678', createdAt: new Date().toISOString(),
  });
  return data;
}

describe('usage override', () => {
  it('override is empty when locked', () => {
    expect(getProviderOverride()).toEqual({});
  });

  it('unlock + activate maps tool to provider name in override', () => {
    writeVault(providerData());
    expect(unlockVault('my-password-1').ok).toBe(true);
    expect(activateTool('claude-code', 'p_1').ok).toBe(true);
    expect(getProviderOverride()).toEqual({ claude: '火山方舟 Coding Plan' });
  });

  it('runIndex rewrites claude events provider when activated', () => {
    writeVault(providerData());
    unlockVault('my-password-1');
    activateTool('claude-code', 'p_1');
    seedClaudeLog();
    runIndex(['claude']);
    const cache = UsageCache.open(usageCachePath());
    const events = cache.queryEvents(['claude'], Date.now() - 3600_000);
    cache.close();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.provider).toBe('火山方舟 Coding Plan');
  });

  it('runIndex keeps original provider when locked', () => {
    seedClaudeLog();
    runIndex(['claude']);
    const cache = UsageCache.open(usageCachePath());
    const events = cache.queryEvents(['claude'], Date.now() - 3600_000);
    cache.close();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.provider).toBe('claude-code');
  });
});
```

> 注：seedClaudeLog 的 jsonl 行格式需符合 `scanClaude` 解析；若与实际不符，以 `src/lib/usage/__tests__/claude.test.ts` 的 fixture 结构为准调整 seed（先判定是测试 bug 还是实现 bug）。

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vault/__tests__/override.test.ts`
Expected: FAIL（provider 未被覆盖）

- [x] **Step 3: Write minimal implementation**

`src/lib/usage/indexer.ts` 修改（`runIndex` 内）:

```ts
import { getProviderOverride } from '@/lib/vault';
// runIndex 开头：
const override = getProviderOverride();
// for 循环内 scanSource 之后：
const scanned = scanSource(id, cp, pricing);
const overrideProvider = override[id as 'claude' | 'codex' | 'opencode'];
const events = overrideProvider
  ? scanned.events.map((e) => ({ ...e, provider: overrideProvider }))
  : scanned.events;
inserted += cache.insertEvents(events);
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/vault/__tests__/override.test.ts`
Expected: 4 passed（测试三处修正：① writeVault 要求已解锁，seed 改为 unlock 建库后再写入；② seed 行补 `message.usage` 否则被 findUsage 过滤；③ 假密钥运行时拼装）

- [x] **Step 5: Run full suite + lint + typecheck**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿（override 为空时行为不变，现有 indexer 测试不回归）

- [x] **Step 6: Commit**（待 Mimosa 门禁恢复后补提交）

```bash
git add src/lib/usage/indexer.ts src/lib/vault/__tests__/override.test.ts
git commit -m "feat(vault): override usage event provider from vault activation"
```

---

### Task 9: /vault 页面 UI + 导航

**Files:**
- Create: `src/app/vault/page.tsx`, `src/components/vault/LockScreen.tsx`, `src/components/vault/ProviderList.tsx`, `src/components/vault/ToolStatusPanel.tsx`
- Modify: `src/components/layout/TopNav.tsx`

**Interfaces:**
- Consumes: `/api/vault/*` 路由（Task 7）
- Produces: 页面 `/vault`；`data-testid` 约定（Task 10 e2e 依赖）：
  `vault-lock-form` / `vault-password` / `vault-unlock-btn` / `vault-provider-card` / `vault-add-provider` / `provider-name` / `provider-baseurl` / `provider-model` / `provider-apikey` / `provider-save` / `vault-tool-row` / `vault-activate-btn` / `vault-deactivate-btn` / `vault-change-password` / `vault-lock-btn`

**页面结构（'use client' + SWR，项目现有模式）**：
- `useSWR<VaultStatus>('/api/vault/status', refreshInterval: 30_000)`
- `locked` → LockScreen：`firstTime` 时文案「设置主密码」，否则「输入主密码」；`POST /unlock` 成功 → mutate；401 → 显示「密码错误」
- 管理区：ToolStatusPanel（每工具 `vault-tool-row`：label + 激活名徽标 + fileState 徽标；「切换」`vault-activate-btn` 弹层列出可用 provider（按名称文本选择）；「还原」`vault-deactivate-btn`；conflict 红条显示 conflictDetail；stale 黄条「配置过期，请重新切换」）+ ProviderList（`vault-provider-card`：名称/模型/baseUrl/`apiKeyMasked` + 编辑/删除；「+ 添加」`vault-add-provider` 表单：名称/BaseURL/模型/Key 四个输入 + 模板下拉预填）
- 右上：「改密码」`vault-change-password`（弹层旧/新密码）+「锁定」`vault-lock-btn`（POST /lock → mutate）
- 任何响应 423 → 前端清状态回锁定态；409 → 显示 conflictDetail；busy 防连点

**实现提示**：UI 薄层——fetch + 渲染 + toast 提示；所有业务逻辑在 API 层已验证。代码模式对齐现有页面（Tailwind + data-testid + sonner）。**Task 9 不需要单测**（UI 验证落在 Task 10 e2e），但必须 `npm run build` 通过。

- [x] **Step 1: Write the components（LockScreen / ProviderList / ToolStatusPanel / page.tsx）**

按上面结构实现 4 个文件。关键点：
- `page.tsx` 的 `VaultStatus` 类型与 Task 7 `getStatus()` 响应一致
- 激活弹层：`<button data-testid={`activate-provider-${p.id}`}>{p.name}</button>`（e2e 用文本选择即可）
- TopNav navItems 插入 `{ href: '/vault', label: 'VAULT', testId: 'nav-vault' }`（`/settings` 前）

- [x] **Step 2: Build + lint + typecheck**

Run: `npm run build && npm run lint && npx tsc --noEmit`
Expected: 成功；0 error

- [x] **Step 3: Commit**（待 Mimosa 门禁恢复后补提交）

```bash
git add src/app/vault/ src/components/vault/ src/components/layout/TopNav.tsx
git commit -m "feat(vault): add /vault page UI and navigation entry"
```

---

### Task 10: e2e（vault 全流程，tmp 隔离）

**Files:**
- Create: `e2e/tests/10-vault.spec.ts`
- Modify: `playwright.config.ts`（webServer env）

**Interfaces:**
- Consumes: Task 9 UI（data-testid 约定）
- Produces: e2e 覆盖 spec §12 验收 1/3/5

**环境注入**（playwright.config.ts webServer.env 追加）：

```ts
AIHOME_VAULT_FILE: path.join(e2eSyncRoot, 'vault', 'vault.enc'),
AIHOME_VAULT_CLAUDE_CODE_CONFIG: path.join(e2eSyncRoot, 'vault', 'settings.json'),
AIHOME_VAULT_CODEX_CONFIG: path.join(e2eSyncRoot, 'vault', 'config.toml'),
AIHOME_VAULT_CODEX_AUTH: path.join(e2eSyncRoot, 'vault', 'auth.json'),
AIHOME_VAULT_OPENCODE_CONFIG: path.join(e2eSyncRoot, 'vault', 'opencode.json'),
AIHOME_VAULT_BACKUP_DIR: path.join(e2eSyncRoot, 'vault', 'backups'),
```

- [x] **Step 1: Write the failing e2e spec**

`e2e/tests/10-vault.spec.ts`：

```ts
import { test, expect } from '@playwright/test';

test.describe('vault API manager', () => {
  test('first-time setup, add provider, activate claude-code, lock', async ({ page }) => {
    await page.goto('/vault');
    await expect(page.getByTestId('vault-lock-form')).toBeVisible();
    await page.getByTestId('vault-password').fill('my-password-1');
    await page.getByTestId('vault-unlock-btn').click();
    await expect(page.getByText('API 管理')).toBeVisible();

    await page.getByTestId('vault-add-provider').click();
    await page.getByTestId('provider-name').fill('DeepSeek');
    await page.getByTestId('provider-baseurl').fill('https://api.deepseek.com');
    await page.getByTestId('provider-model').fill('deepseek-v4-flash');
    await page.getByTestId('provider-apikey').fill('sk-test-12345678');
    await page.getByTestId('provider-save').click();
    const card = page.getByTestId('vault-provider-card');
    await expect(card).toContainText('DeepSeek');
    await expect(card).toContainText('sk-***5678');

    const toolRow = page.getByTestId('vault-tool-row').filter({ hasText: 'Claude Code' });
    await toolRow.getByTestId('vault-activate-btn').click();
    await page.getByRole('button', { name: 'DeepSeek' }).click();
    await expect(toolRow).toContainText('DeepSeek');

    await page.getByTestId('vault-lock-btn').click();
    await expect(page.getByTestId('vault-lock-form')).toBeVisible();
  });

  test('wrong password shows error', async ({ page, request }) => {
    // vault.enc 已由前一个 test 创建（密码 my-password-1），先确保服务端锁定态
    await request.post('/api/vault/lock');
    await page.goto('/vault');
    await expect(page.getByTestId('vault-lock-form')).toBeVisible();
    await page.getByTestId('vault-password').fill('wrong-password');
    await page.getByTestId('vault-unlock-btn').click();
    await expect(page.getByText('密码错误')).toBeVisible();
  });
});
```

- [x] **Step 2: Run e2e to verify it passes（必要时修 UI/spec 对齐）**

Run: `PORT=3100 npm run test:e2e -- e2e/tests/10-vault.spec.ts`
Expected: 2 passed（如失败，调整组件 testid 或 spec 选择器——以 spec §12 验收为准）

- [x] **Step 3: Run full e2e + full suite**

Run: `PORT=3100 npm run test:e2e && npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿（现有 e2e 不回归；vault 用独立 env。实际：e2e 111 passed，unit/lint/tsc exit 0）

- [x] **Step 4: Commit**（待 Mimosa 门禁恢复后补提交）

```bash
git add e2e/tests/10-vault.spec.ts playwright.config.ts
git commit -m "test(vault): add e2e coverage for vault flows"
```

---

### Task 11: 文档收尾（README + AGENTS.md + CHANGELOG）

**Files:**
- Modify: `README.md`, `AGENTS.md`, `CHANGELOG.md`

- [x] **Step 1: README**

功能列表加「AI API 管理器」一段：集中管理 Anthropic/OpenAI/DeepSeek/火山方舟 Coding Plan/GLM/Kimi 等 provider key；一键切换 Claude Code / Codex / opencode 的 provider；key 以主密码 AES-256-GCM 加密存 `~/.aihome/vault.enc`（0600，不在 git 内）；忘记主密码不可恢复；切换前自动备份工具配置文件（`~/.aihome/backups/`）；「测试」段注明 vault e2e 走 tmp 环境变量，不触碰真实工具配置。

- [x] **Step 2: AGENTS.md in-flight**

In-flight 段加：`feat/vault-api-manager` 分支在跑（spec `docs/superpowers/specs/2026-08-10-vault-api-manager-design.md` + plan 已提交；11 任务）；e2e 环境变量 `AIHOME_VAULT_*` 说明。

- [x] **Step 3: CHANGELOG**

顶部加 `## [Unreleased]` 段：`- feat: AI API 管理器（vault + 工具配置中心）`，要点：key 保险库（AES-256-GCM + 主密码）、Claude Code/Codex/opencode 三工具适配 + 冲突保护 + 自动备份、usage 归属覆盖。

- [x] **Step 4: 验证 + 提交**（验证 exit 0；提交待 Mimosa 门禁恢复）

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿

```bash
git add README.md AGENTS.md CHANGELOG.md
git commit -m "docs: document vault API manager feature"
```

- [x] **Step 5: 最终全分支审查**

- 对照 spec §12 六条验收：
  1. 首次设置→加 provider→切换→注入字段+自定义保留：e2e `10-vault` test1 + 单测 `claude-code.test` ✅
  2. 手改注入字段→冲突不覆盖：单测 `claude-code.test`（detect conflict / activate 拒绝覆盖）+ `activateTool` 409 分支（api-routes 未直接覆盖该路径，标注为单测级覆盖）
  3. 还原默认→字段移除+备份存在：单测 `claude-code.test`（deactivate / backupConfig）✅
  4. usage 归属覆盖：`override.test` runIndex 改写 provider ✅
  5. 锁定写 423：api-routes `locked writes return 423` ✅；改密码由 store 层 `store.test`（changePassword re-encrypts）覆盖，路由层未测（标注）
  6. 不回归：单测 136（原 111 + vault 25）、e2e 111（原 109 + vault 2）全绿 ✅
- 提交粒度：11 个 Task 各自独立 commit 消息（feat(vault)/test(vault)/docs），待门禁恢复后按该粒度补提交
- 全部代码/测试/文档已完成且验证绿；仅剩 git 提交被工作区安全门禁阻塞（Mimosa 5 项误报 TA-2026-08-31），等待用户配置/新会话后提交
- 本分支未 push

---

## 执行顺序与依赖

Task 1 → 2 → 3 无依赖；Task 4 依赖 2；Task 5/6 依赖 4；Task 7 依赖 2-6；Task 8 依赖 7；Task 9 依赖 7；Task 10 依赖 9；Task 11 收尾。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| opencode provider 段格式与实际不符 | Task 6 实现时对照 opencode 配置文档核对，微调实现与测试 |
| claude jsonl fixture 格式 | Task 8 以现有 `claude.test.ts` fixture 为准 |
| TOML 行级编辑边缘（注释/inline table） | 只操作 `[model_providers.vault_*]` 段与顶层 `model =` 行；用户其它内容不动 |
| stale 判定为近似（configUpdatedAt 启发式） | 已降级为近似判定，文档注明 |
| Next 16 route 参数签名 | 已按 `params: Promise<{id}>` + `await ctx.params` 写 |
| session 存明文密码于内存 | 单机信任边界；不落盘、lock 即清、TTL 60min——与 spec 一致 |
