'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useI18n, type DictKey } from '@/lib/i18n';
import { vaultFetch, type VaultStatus } from './LockScreen';

const FILE_STATE_KEYS: Record<string, DictKey> = {
  missing: 'vault.fileState.missing',
  conflict: 'vault.fileState.conflict',
  unwritable: 'vault.fileState.unwritable',
  locked: 'vault.fileState.locked',
};

export function ToolStatusPanel({
  tools, providers, onChanged,
}: {
  tools: VaultStatus['tools'];
  providers: VaultStatus['providers'];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerTool, setPickerTool] = useState<string | null>(null);

  const activate = async (tool: string, providerId: string) => {
    setBusyId(tool);
    setPickerTool(null);
    try {
      const res = await vaultFetch('/api/vault/activate', {
        method: 'POST',
        body: JSON.stringify({ tool, providerId }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as { conflictDetail?: string };
        toast.error(t('vault.toast.conflict', { detail: body.conflictDetail ?? t('vault.toast.manualConflict') }));
      } else if (res.status === 423) {
        toast.error(t('vault.toast.sessionLocked'));
      } else if (!res.ok) {
        toast.error(t('vault.toast.activateFailed'));
      } else {
        toast.success(t('vault.toast.switched'));
        onChanged();
      }
    } catch {
      toast.error(t('vault.toast.network'));
    } finally {
      setBusyId(null);
    }
  };

  const deactivate = async (tool: string) => {
    setBusyId(tool);
    try {
      const res = await vaultFetch('/api/vault/deactivate', {
        method: 'POST',
        body: JSON.stringify({ tool }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as { conflictDetail?: string };
        toast.error(t('vault.toast.conflict', { detail: body.conflictDetail ?? t('vault.toast.manualConflict') }));
      } else if (!res.ok) {
        toast.error(t('vault.toast.restoreFailed'));
      } else {
        toast.success(t('vault.toast.restoredDefault'));
        onChanged();
      }
    } catch {
      toast.error(t('vault.toast.network'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-bold text-primary">{t('vault.toolStatus')}</h2>
      {tools.map((tool) => {
        const fileStateKey = FILE_STATE_KEYS[tool.fileState];
        return (
        <div key={tool.id} data-testid="vault-tool-row" className="rounded-xl border border-divider bg-white/90 p-4">
          <div className="flex items-center gap-3">
            <span className="font-medium text-primary">{tool.label}</span>
            {tool.activeProviderName && (
              <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">{tool.activeProviderName}</span>
            )}
            <span className="rounded-full bg-secondary/10 text-secondary text-xs px-2 py-0.5">
              {fileStateKey ? t(fileStateKey) : tool.fileState}
            </span>
            <div className="ml-auto flex gap-2">
              {providers.length > 0 && (
                <button
                  data-testid="vault-activate-btn"
                  onClick={() => setPickerTool(tool.id)}
                  disabled={busyId === tool.id}
                  className="rounded-lg bg-primary text-white px-3 py-1 text-xs font-medium disabled:opacity-40"
                >
                  {t('vault.switch')}
                </button>
              )}
              <button
                data-testid="vault-deactivate-btn"
                onClick={() => deactivate(tool.id)}
                disabled={busyId === tool.id || !tool.activeProviderId}
                className="rounded-lg border border-divider px-3 py-1 text-xs font-medium disabled:opacity-40"
              >
                {t('vault.restore')}
              </button>
            </div>
          </div>
          {tool.conflictDetail && (
            <p className="mt-2 text-xs text-red-600">⚠ {tool.conflictDetail}</p>
          )}
          {tool.stale && (
            <p className="mt-2 text-xs text-amber-600">⚠ {t('vault.staleWarning')}</p>
          )}
          {pickerTool === tool.id && (
            <div className="mt-3 rounded-lg bg-secondary/5 border border-divider p-3 space-y-2">
              <p className="text-xs text-secondary">{t('vault.chooseProvider')}</p>
              {providers.map((p) => (
                <button
                  key={p.id}
                  data-testid={`activate-provider-${p.id}`}
                  onClick={() => activate(tool.id, p.id)}
                  className="block w-full text-left rounded-lg border border-divider bg-white px-3 py-2 text-sm hover:bg-primary/5"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        );
      })}
    </section>
  );
}