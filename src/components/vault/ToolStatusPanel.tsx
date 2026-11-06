'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useI18n, type DictKey } from '@/lib/i18n';
import { vaultFetch, type VaultStatus } from './LockScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const FILE_STATE_KEYS: Record<string, DictKey> = {
  missing: 'vault.fileState.missing',
  conflict: 'vault.fileState.conflict',
  unwritable: 'vault.fileState.unwritable',
  locked: 'vault.fileState.locked',
};

const FILE_STATE_TONES: Record<string, 'warning' | 'danger' | 'neutral'> = {
  missing: 'warning',
  conflict: 'danger',
  unwritable: 'danger',
  locked: 'neutral',
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
      <h2 className="font-heading text-lg font-bold text-heading">{t('vault.toolStatus')}</h2>
      {tools.map((tool) => {
        const fileStateKey = FILE_STATE_KEYS[tool.fileState];
        return (
        <Card key={tool.id} data-testid="vault-tool-row">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-medium text-heading">{tool.label}</span>
            {tool.activeProviderName && (
              <Badge tone="info">{tool.activeProviderName}</Badge>
            )}
            <Badge tone={FILE_STATE_TONES[tool.fileState] ?? 'neutral'}>
              {fileStateKey ? t(fileStateKey) : tool.fileState}
            </Badge>
            <div className="ml-auto flex gap-2">
              {providers.length > 0 && (
                <Button
                  data-testid="vault-activate-btn"
                  onClick={() => setPickerTool(tool.id)}
                  disabled={busyId === tool.id}
                  size="sm"
                >
                  {t('vault.switch')}
                </Button>
              )}
              <Button
                data-testid="vault-deactivate-btn"
                onClick={() => deactivate(tool.id)}
                disabled={busyId === tool.id || !tool.activeProviderId}
                variant="secondary"
                size="sm"
              >
                {t('vault.restore')}
              </Button>
            </div>
          </div>
          {tool.conflictDetail && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">⚠ {tool.conflictDetail}</p>
          )}
          {tool.stale && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">⚠ {t('vault.staleWarning')}</p>
          )}
          {pickerTool === tool.id && (
            <div className="mt-3 rounded-lg bg-primary/5 border border-divider p-3 space-y-2">
              <p className="text-xs text-muted">{t('vault.chooseProvider')}</p>
              {providers.map((p) => (
                <button
                  key={p.id}
                  data-testid={`activate-provider-${p.id}`}
                  onClick={() => activate(tool.id, p.id)}
                  className="block w-full text-left rounded-lg border border-card-border glass-input px-3 py-2 text-sm text-text-body hover:border-secondary hover:text-primary transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </Card>
        );
      })}
    </section>
  );
}
