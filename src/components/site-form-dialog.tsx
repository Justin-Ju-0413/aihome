'use client';
import { useState } from 'react';
import { useWorkbenchStore } from '@/stores/workbench-store';
import type { SiteView } from '@/stores/workbench-store';

const CATEGORIES = ['对话', 'API平台', '图像', '代码', '知识库', '搜索', '其他'];

export default function SiteFormDialog({ site, onClose }: { site: SiteView | null; onClose: () => void }) {
  const saveSite = useWorkbenchStore((s) => s.saveSite);
  const removeSite = useWorkbenchStore((s) => s.removeSite);
  const [name, setName] = useState(site?.name ?? '');
  const [url, setUrl] = useState(site?.url ?? '');
  const [category, setCategory] = useState(site?.category ?? '其他');
  const [tags, setTags] = useState((site?.tags ?? []).join(', '));
  const [notes, setNotes] = useState(site?.notes ?? '');
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError('名称和网址必填');
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
      setError('保存失败');
    }
  }

  async function handleDelete() {
    if (!site) return;
    await removeSite(site.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center scrim p-4" onClick={onClose}>
      <div
        className="w-full max-w-md glass-modal rounded-xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="site-form-dialog"
      >
        <h2 className="mb-3 text-lg font-semibold">{site ? '编辑平台' : '添加平台'}</h2>
        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <label className="block text-sm">
            名称
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            网址
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-card-border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            分类
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border px-2 py-1.5 text-sm"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            标签（逗号分隔）
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="mt-1 w-full rounded-md border border-card-border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            备注
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-card-border px-2 py-1.5 text-sm"
            />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-between gap-2 pt-1">
            <div className="flex gap-2">
              {site && (
                <button type="button" onClick={() => void handleDelete()} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                  删除
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-md border border-card-border px-3 py-1.5 text-sm hover:bg-primary/5">取消</button>
              <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90">保存</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
