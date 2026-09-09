'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { PROVIDER_TEMPLATES } from '@/lib/vault/providers';
import { useI18n } from '@/lib/i18n';
import { vaultFetch, type VaultStatus } from './LockScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input, FieldLabel } from '@/components/ui/Input';

export function ProviderList({
  providers, onChanged,
}: {
  providers: VaultStatus['providers'];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', baseUrl: '', model: '', apiKey: '' });

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '', baseUrl: '', model: '', apiKey: '' });
    setFormOpen(true);
  };

  const openEdit = (p: VaultStatus['providers'][number]) => {
    setEditingId(p.id);
    setForm({ name: p.name, baseUrl: p.baseUrl, model: p.model, apiKey: '' });
    setFormOpen(true);
  };

  const applyTemplate = (templateId: string) => {
    const tpl = PROVIDER_TEMPLATES.find((p) => p.id === templateId);
    if (!tpl) return;
    setForm((f) => ({ ...f, name: tpl.name, baseUrl: tpl.baseUrl, model: tpl.model }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await vaultFetch('/api/vault/providers', {
        method: 'POST',
        body: JSON.stringify({ id: editingId ?? undefined, ...form }),
      });
      if (res.status === 409) {
        toast.error(t('vault.toast.providerInUse'));
      } else if (res.status === 423) {
        toast.error(t('vault.toast.sessionLocked'));
      } else if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        toast.error(body.error ?? t('vault.toast.saveFailed'));
      } else {
        toast.success(editingId ? t('vault.toast.updated') : t('vault.toast.added'));
        setFormOpen(false);
        onChanged();
      }
    } catch {
      toast.error(t('vault.toast.network'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: VaultStatus['providers'][number]) => {
    setBusy(true);
    try {
      const res = await vaultFetch(`/api/vault/providers/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
      if (res.status === 409) {
        toast.error(t('vault.toast.providerInUse'));
      } else if (!res.ok) {
        toast.error(t('vault.toast.deleteFailed'));
      } else {
        toast.success(t('vault.toast.deleted'));
        onChanged();
      }
    } catch {
      toast.error(t('vault.toast.network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold text-heading">Provider</h2>
        <Button data-testid="vault-add-provider" onClick={openNew} size="sm">
          <Plus className="w-4 h-4" />
          {t('vault.add')}
        </Button>
      </div>

      {formOpen && (
        <Card className="animate-fade-in">
          <div className="flex gap-2 items-center mb-4">
            <select
              aria-label={t('vault.template')}
              onChange={(e) => applyTemplate(e.target.value)}
              defaultValue=""
              className="rounded-lg border border-card-border glass-input px-2 py-1.5 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">{t('vault.prefillFromTemplate')}</option>
              {PROVIDER_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
            <button onClick={() => setFormOpen(false)} aria-label={t('common.close')} className="text-muted hover:text-primary ml-auto">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <FieldLabel>{t('vault.name')}</FieldLabel>
              <Input data-testid="provider-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" />
            </div>
            <div>
              <FieldLabel>Base URL</FieldLabel>
              <Input data-testid="provider-baseurl" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} className="w-full" />
            </div>
            <div>
              <FieldLabel>{t('vault.model')}</FieldLabel>
              <Input data-testid="provider-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="w-full" />
            </div>
            <div>
              <FieldLabel>API Key</FieldLabel>
              <Input data-testid="provider-apikey" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} className="w-full" />
            </div>
          </div>
          <Button data-testid="provider-save" onClick={save} disabled={busy}>
            {t('common.save')}
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {providers.map((p) => (
          <Card key={p.id} data-testid="vault-provider-card" className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-heading">{p.name}</span>
              <span className="text-xs font-mono text-muted">{p.apiKeyMasked}</span>
            </div>
            <p className="text-xs text-muted">{p.model}</p>
            <p className="text-xs text-muted break-all">{p.baseUrl}</p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => openEdit(p)} className="text-xs font-medium text-primary hover:underline">{t('common.edit')}</button>
              <button onClick={() => remove(p)} disabled={busy} className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-40">{t('common.delete')}</button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
