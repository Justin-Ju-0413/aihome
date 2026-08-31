import { TOOL_ADAPTERS } from './adapters';
import { validateProviderInput } from './providers';
import {
  emptyVaultData, isUnlocked, lock, maskKey, newProviderId, readVault,
  touchSession, unlock, vaultExists, writeVault, changePassword as storeChangePassword,
  type ToolId, type VaultData,
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
      ? { fileState: 'locked' as const, activeProviderId: null, conflictDetail: undefined }
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

export { touchSession };
