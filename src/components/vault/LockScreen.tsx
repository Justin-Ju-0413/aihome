'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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
        className="w-full max-w-sm glass-modal rounded-2xl border border-card-border p-8 shadow-xl animate-fade-in"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold text-heading">{t('vault.appTitle')}</h1>
          <p className="text-sm text-muted mt-1">{firstTime ? t('vault.setPassword') : t('vault.enterPassword')}</p>
        </div>
        <Input
          data-testid="vault-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('vault.masterPassword')}
          className="w-full mb-4"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
        <Button data-testid="vault-unlock-btn" type="submit" disabled={busy || password.length < 8} className="w-full">
          {firstTime ? t('vault.createAndUnlock') : t('vault.unlock')}
        </Button>
      </form>
    </div>
  );
}
