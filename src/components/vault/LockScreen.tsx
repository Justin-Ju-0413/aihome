'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

export interface VaultStatus {
  locked: boolean;
  firstTime: boolean;
  providers: Array<{
    id: string; name: string; baseUrl: string; model: string;
    createdAt: string; lastUsedAt?: string; apiKeyMasked: string;
  }>;
  tools: Array<{
    id: string; label: string;
    activeProviderId: string | null; activeProviderName: string | null;
    fileState: string; conflictDetail?: string; stale: boolean;
  }>;
}

export async function vaultFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  return res;
}

export function LockScreen({ firstTime, onUnlocked }: { firstTime: boolean; onUnlocked: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await vaultFetch('/api/vault/unlock', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onUnlocked();
      } else {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? (res.status === 401 ? t('vault.error.wrongPassword') : t('vault.error.operationFailed')));
      }
    } catch {
      setError(t('vault.toast.network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form
        data-testid="vault-lock-form"
        onSubmit={submit}
        className="w-full max-w-sm bg-white/90 backdrop-blur-sm border border-divider rounded-2xl p-8 shadow-sm"
      >
        <h1 className="font-heading text-xl font-bold text-primary mb-1">{t('vault.appTitle')}</h1>
        <p className="text-sm text-secondary mb-6">{firstTime ? t('vault.setPassword') : t('vault.enterPassword')}</p>
        <input
          data-testid="vault-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('vault.masterPassword')}
          className="w-full rounded-lg border border-divider px-3 py-2 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          data-testid="vault-unlock-btn"
          type="submit"
          disabled={busy || password.length < 8}
          className="w-full rounded-lg bg-primary text-white py-2 text-sm font-medium disabled:opacity-40"
        >
          {firstTime ? t('vault.createAndUnlock') : t('vault.unlock')}
        </button>
      </form>
    </div>
  );
}