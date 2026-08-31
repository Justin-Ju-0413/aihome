'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function EndpointSettings() {
  const { t } = useI18n();
  const [endpoints, setEndpoints] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/endpoints');
      const data = await res.json();
      if (res.ok) setEndpoints(data.endpoints);
      else toast.error(data.error ?? t('sync.endpoint.loadFailed'));
    } catch {
      toast.error(t('sync.endpoint.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch endpoints on mount
    load();
  }, [load]);

  const handleSave = async () => {
    try {
      const res = await fetch('/api/sync/endpoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoints }),
      });
      const data = await res.json();
      if (res.ok) {
        setEndpoints(data.endpoints);
        toast.success(t('sync.endpoint.saved'));
      } else {
        toast.error(data.error ?? t('sync.endpoint.saveFailed'));
      }
    } catch {
      toast.error(t('sync.endpoint.saveFailed'));
    }
  };

  const handleAdd = () => {
    if (!newName.trim() || !newPath.trim()) return;
    setEndpoints({ ...endpoints, [newName.trim()]: newPath.trim() });
    setNewName('');
    setNewPath('');
  };

  const handleRemove = (name: string) => {
    const next = { ...endpoints };
    delete next[name];
    setEndpoints(next);
  };

  return (
    <section className="mb-8">
      <h2 className="font-heading text-xl font-semibold mb-4">{t('sync.endpoint.title')}</h2>
      <div className="space-y-2 mb-4">
        {Object.entries(endpoints).map(([name, p]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="w-32 font-medium">{name}</span>
            <input
              value={p}
              onChange={(e) => setEndpoints({ ...endpoints, [name]: e.target.value })}
              className="flex-1 px-3 py-2 border border-divider rounded-lg text-sm"
            />
            <button onClick={() => handleRemove(name)} className="text-red-500 hover:text-red-700" aria-label={t('sync.endpoint.deleteLabel', { name })}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('sync.endpoint.namePlaceholder')}
          className="w-40 px-3 py-2 border border-divider rounded-lg text-sm"
        />
        <input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder={t('sync.endpoint.pathPlaceholder')}
          className="flex-1 px-3 py-2 border border-divider rounded-lg text-sm"
        />
        <button onClick={handleAdd} className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-divider rounded-lg">
          <Plus size={16} /> {t('common.add')}
        </button>
      </div>
      <button onClick={handleSave} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg">
        <Save size={16} /> {t('sync.endpoint.saveAll')}
      </button>
    </section>
  );
}
