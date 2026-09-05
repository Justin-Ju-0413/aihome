'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useWorkbenchStore } from '@/stores/workbench-store';
import type { SiteView } from '@/stores/workbench-store';
import type { KeyView } from '@/lib/workbench/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, FieldLabel } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

const PROVIDERS = ['deepseek', 'openai', 'openrouter', 'none'];

export default function KeyDialog({ site, onClose }: { site: SiteView; onClose: () => void }) {
  const { t } = useI18n();
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
      setError(t('key.errorEmpty'));
      return;
    }
    try {
      await saveKey(site.id, { label: label.trim() || t('key.defaultLabel'), provider, key: key.trim() });
      onClose();
    } catch {
      setError(t('common.saveFailed'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('key.title', { name: site.name })}
      className="!p-0"
    >
      <div data-testid="key-dialog" className="-my-2">
        {keys.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-2 rounded-lg border border-card-border glass-input px-2.5 py-1.5">
                <div className="min-w-0 text-xs text-text-body">
                  <span className="font-medium text-heading">{k.label}</span>{' '}
                  <span className="text-muted font-mono">{k.masked}</span>
                  {k.isCurrent && <Badge tone="success" className="ml-1.5">{t('common.current')}</Badge>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {!k.isCurrent && (
                    <Button variant="secondary" size="sm" className="!px-1.5 !py-0.5" onClick={() => void setCurrentKey(site.id, k.id)}>
                      {t('common.setCurrent')}
                    </Button>
                  )}
                  <Button variant="danger" size="sm" className="!px-1.5 !py-0.5" onClick={() => void deleteKey(k.id)}>
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <div>
            <FieldLabel>label</FieldLabel>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('key.defaultLabel')} className="w-full" />
          </div>
          <div>
            <FieldLabel>provider</FieldLabel>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-lg border border-card-border glass-input px-3 py-2 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>key</FieldLabel>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-..." className="w-full" />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
