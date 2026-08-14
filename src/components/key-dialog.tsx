'use client';
import { useEffect, useState } from 'react';
import { useWorkbenchStore } from '@/stores/workbench-store';
import type { SiteView } from '@/stores/workbench-store';
import type { KeyView } from '@/lib/workbench/types';

const PROVIDERS = ['deepseek', 'openai', 'openrouter', 'none'];

export default function KeyDialog({ site, onClose }: { site: SiteView; onClose: () => void }) {
  const saveKey = useWorkbenchStore((s) => s.saveKey);
  const deleteKey = useWorkbenchStore((s) => s.deleteKey);
  const setCurrentKey = useWorkbenchStore((s) => s.setCurrentKey);
  const [keys, setKeys] = useState<KeyView[]>([]);
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState(site.currentKey?.provider ?? 'deepseek');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/workbench/keys?siteId=${encodeURIComponent(site.id)}`)
      .then((r) => r.json())
      .then((d) => setKeys(d.keys))
      .catch(() => setKeys([]));
  }, [site.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) {
      setError('key 不能为空');
      return;
    }
    try {
      await saveKey(site.id, { label: label.trim() || '主 key', provider, key: key.trim() });
      onClose();
    } catch {
      setError('保存失败');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center scrim p-4" onClick={onClose}>
      <div
        className="w-full max-w-md glass-modal rounded-xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="key-dialog"
      >
        <h2 className="mb-3 text-lg font-semibold">配置 key — {site.name}</h2>

        {keys.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-2 rounded-md border border-card-border px-2 py-1.5">
                <div className="min-w-0 text-xs">
                  <span className="font-medium">{k.label}</span>{' '}
                  <span className="text-body">{k.masked}</span>
                  {k.isCurrent && <span className="ml-1 text-green-600">当前</span>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {!k.isCurrent && (
                    <button onClick={() => void setCurrentKey(site.id, k.id)} className="rounded border border-card-border px-1.5 py-0.5 text-xs hover:bg-primary/5">
                      设为当前
                    </button>
                  )}
                  <button onClick={() => void deleteKey(k.id)} className="rounded border border-red-100 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50">
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <label className="block text-sm">
            label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="主 key"
              className="mt-1 w-full rounded-md border border-card-border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            provider
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border px-2 py-1.5 text-sm"
            >
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            key
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              className="mt-1 w-full rounded-md border border-card-border px-2 py-1.5 text-sm"
            />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-card-border px-3 py-1.5 text-sm hover:bg-primary/5">取消</button>
            <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}
