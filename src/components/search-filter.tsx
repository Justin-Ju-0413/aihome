'use client';

import { useI18n } from '@/lib/i18n';

export default function SearchFilter({ search, setSearch, category, setCategory, categories }: {
  search: string;
  setSearch: (s: string) => void;
  category: string;
  setCategory: (c: string) => void;
  categories: string[];
}) {
  const { t } = useI18n();
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
  return (
    <div className="flex gap-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('workbench.searchPlaceholder')}
        data-testid="search-input"
        className="w-full max-w-xs rounded-md border border-card-border px-3 py-1.5 text-sm"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        data-testid="category-select"
        className="rounded-md border border-card-border px-2 py-1.5 text-sm"
      >
        {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
      </select>
    </div>
  );
}
