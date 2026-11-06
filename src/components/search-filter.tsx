'use client';

import { Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Input } from '@/components/ui/Input';

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
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('workbench.searchPlaceholder')}
          data-testid="search-input"
          className="w-full pl-9"
        />
      </div>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        data-testid="category-select"
        className="rounded-lg border border-card-border glass-input px-2 py-2 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
      </select>
    </div>
  );
}
