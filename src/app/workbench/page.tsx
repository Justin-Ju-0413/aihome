'use client';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useWorkbenchStore } from '@/stores/workbench-store';
import type { SiteView } from '@/stores/workbench-store';
import PlatformCard from '@/components/platform-card';
import SearchFilter from '@/components/search-filter';
import KeyDialog from '@/components/key-dialog';
import SiteFormDialog from '@/components/site-form-dialog';

// 分类值（存储规范值，用于过滤/分组；展示文案经 categoryLabel 本地化）
const CATEGORIES = ['全部', '对话', 'API平台', '图像', '代码', '知识库', '搜索', '其他'];

export default function Home() {
  const { t } = useI18n();
  const sites = useWorkbenchStore((s) => s.sites);
  const loaded = useWorkbenchStore((s) => s.loaded);
  const search = useWorkbenchStore((s) => s.search);
  const category = useWorkbenchStore((s) => s.category);
  const setSearch = useWorkbenchStore((s) => s.setSearch);
  const setCategory = useWorkbenchStore((s) => s.setCategory);
  const load = useWorkbenchStore((s) => s.load);
  const [editing, setEditing] = useState<SiteView | null>(null);
  const [keyFor, setKeyFor] = useState<SiteView | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const categoryLabel = (c: string): string => {
    switch (c) {
      case '全部': return t('workbench.catAll');
      case '对话': return t('workbench.catChat');
      case 'API平台': return t('workbench.catApi');
      case '图像': return t('workbench.catImage');
      case '代码': return t('workbench.catCode');
      case '知识库': return t('workbench.catKnowledge');
      case '搜索': return t('workbench.catSearch');
      default: return t('workbench.catOther');
    }
  };

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sites
      .filter((s) => (category === '全部' || s.category === category))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [sites, search, category]);

  const groups = useMemo(() => {
    const m = new Map<string, SiteView[]>();
    for (const s of filtered) {
      const arr = m.get(s.category) ?? [];
      arr.push(s);
      m.set(s.category, arr);
    }
    return [...m.entries()];
  }, [filtered]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-heading">{t('workbench.title')}</h1>
        <button onClick={() => setShowAdd(true)} data-testid="add-site" className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90">+ {t('workbench.addPlatform')}</button>
      </header>
      <SearchFilter search={search} setSearch={setSearch} category={category} setCategory={setCategory} categories={CATEGORIES} />
      {!loaded && <p className="mt-8 text-center text-body">{t('workbench.loading')}</p>}
      {loaded && groups.length === 0 && <p className="mt-8 text-center text-body">{t('workbench.noMatch')}</p>}
      <div className="mt-6 space-y-8">
        {groups.map(([cat, items]) => (
          <section key={cat} data-testid={`group-${cat}`}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-body">{categoryLabel(cat)}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((s) => <PlatformCard key={s.id} site={s} onEdit={setEditing} onConfigKey={setKeyFor} />)}
            </div>
          </section>
        ))}
      </div>
      {keyFor && <KeyDialog site={keyFor} onClose={() => setKeyFor(null)} />}
      {editing && <SiteFormDialog site={editing} onClose={() => setEditing(null)} />}
      {showAdd && <SiteFormDialog site={null} onClose={() => setShowAdd(false)} />}
    </main>
  );
}
