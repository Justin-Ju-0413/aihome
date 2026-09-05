'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useWorkbenchStore } from '@/stores/workbench-store';
import type { SiteView } from '@/stores/workbench-store';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, FieldLabel } from '@/components/ui/Input';

const CATEGORIES = ['对话', 'API平台', '图像', '代码', '知识库', '搜索', '其他'];

export default function SiteFormDialog({ site, onClose }: { site: SiteView | null; onClose: () => void }) {
  const { t } = useI18n();
  const saveSite = useWorkbenchStore((s) => s.saveSite);
  const removeSite = useWorkbenchStore((s) => s.removeSite);
  const [name, setName] = useState(site?.name ?? '');
  const [url, setUrl] = useState(site?.url ?? '');
  const [category, setCategory] = useState(site?.category ?? '其他');
  const [tags, setTags] = useState((site?.tags ?? []).join(', '));
  const [notes, setNotes] = useState(site?.notes ?? '');
  const [error, setError] = useState('');

  const categoryLabel = (c: string): string => {
    switch (c) {
      case '对话': return t('workbench.catChat');
      case 'API平台': return t('workbench.catApi');
      case '图像': return t('workbench.catImage');
      case '代码': return t('workbench.catCode');
      case '知识库': return t('workbench.catKnowledge');
      case '搜索': return t('workbench.catSearch');
      default: return t('workbench.catOther');
    }
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError(t('workbench.nameUrlRequired'));
      return;
    }
    try {
      await saveSite({
        id: site?.id,
        name: name.trim(),
        url: url.trim(),
        category,
        tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
        notes: notes.trim(),
      });
      onClose();
    } catch {
      setError(t('common.saveFailed'));
    }
  }

  async function handleDelete() {
    if (!site) return;
    await removeSite(site.id);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={site ? t('workbench.editPlatform') : t('workbench.addPlatform')}
      className="!p-0"
    >
      <form onSubmit={(e) => void handleSave(e)} data-testid="site-form-dialog" className="-my-2 space-y-3">
        <div>
          <FieldLabel>{t('common.name')}</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
        </div>
        <div>
          <FieldLabel>{t('common.url')}</FieldLabel>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="w-full" />
        </div>
        <div>
          <FieldLabel>{t('common.category')}</FieldLabel>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-card-border glass-input px-3 py-2 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel>{t('workbench.tagsLabel')}</FieldLabel>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} className="w-full" />
        </div>
        <div>
          <FieldLabel>{t('common.notes')}</FieldLabel>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full" />
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-between gap-2 pt-1">
          <div>
            {site && (
              <Button type="button" variant="danger" onClick={() => void handleDelete()}>
                {t('common.delete')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
