'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { PROVIDER_TEMPLATES } from '@/lib/vault/providers';
import { vaultFetch, type VaultStatus } from './LockScreen';

export function ProviderList({
  providers, onChanged,
}: {
  providers: VaultStatus['providers'];
  onChanged: () => void;
}) {
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
    const t = PROVIDER_TEMPLATES.find((p) => p.id === templateId);
    if (!t) return;
    setForm((f) => ({ ...f, name: t.name, baseUrl: t.baseUrl, model: t.model }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await vaultFetch('/api/vault/providers', {
        method: 'POST',
        body: JSON.stringify({ id: editingId ?? undefined, ...form }),
      });
      if (res.status === 409) {
        toast.error('provider 正在被使用，请先还原默认');
      } else if (res.status === 423) {
        toast.error('会话已锁定');
      } else if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        toast.error(body.error ?? '保存失败');
      } else {
        toast.success(editingId ? '已更新' : '已添加');
        setFormOpen(false);
        onChanged();
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: VaultStatus['providers'][number]) => {
    setBusy(true);
    try {
      const res = await vaultFetch(`/api/vault/providers/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
      if (res.status === 409) {
        toast.error('provider 正在被使用，请先还原默认');
      } else if (!res.ok) {
        toast.error('删除失败');
      } else {
        toast.success('已删除');
        onChanged();
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold text-primary">Provider</h2>
        <button
          data-testid="vault-add-provider"
          onClick={openNew}
          className="rounded-lg bg-primary text-white px-4 py-1.5 text-sm font-medium"
        >
          + 添加
        </button>
      </div>

      {formOpen && (
        <div className="rounded-xl border border-divider bg-white/90 p-4 space-y-3">
          <div className="flex gap-2 items-center">
            <select
              aria-label="模板"
              onChange={(e) => applyTemplate(e.target.value)}
              defaultValue=""
              className="rounded-lg border border-divider px-2 py-1.5 text-sm"
            >
              <option value="">从模板预填</option>
              {PROVIDER_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button onClick={() => setFormOpen(false)} className="text-sm text-secondary ml-auto">关闭</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              data-testid="provider-name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="名称"
              className="rounded-lg border border-divider px-3 py-2 text-sm"
            />
            <input
              data-testid="provider-baseurl" value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="Base URL"
              className="rounded-lg border border-divider px-3 py-2 text-sm"
            />
            <input
              data-testid="provider-model" value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="模型"
              className="rounded-lg border border-divider px-3 py-2 text-sm"
            />
            <input
              data-testid="provider-apikey" type="password" value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="API Key"
              className="rounded-lg border border-divider px-3 py-2 text-sm"
            />
          </div>
          <button
            data-testid="provider-save" onClick={save} disabled={busy}
            className="rounded-lg bg-primary text-white px-4 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            保存
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {providers.map((p) => (
          <div key={p.id} data-testid="vault-provider-card" className="rounded-xl border border-divider bg-white/90 p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-primary">{p.name}</span>
              <span className="text-xs font-mono text-secondary">{p.apiKeyMasked}</span>
            </div>
            <p className="text-xs text-secondary">{p.model}</p>
            <p className="text-xs text-secondary break-all">{p.baseUrl}</p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => openEdit(p)} className="text-xs text-primary">编辑</button>
              <button onClick={() => remove(p)} disabled={busy} className="text-xs text-red-600 disabled:opacity-40">删除</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}