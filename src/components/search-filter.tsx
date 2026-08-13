'use client';

export default function SearchFilter({ search, setSearch, category, setCategory, categories }: {
  search: string;
  setSearch: (s: string) => void;
  category: string;
  setCategory: (c: string) => void;
  categories: string[];
}) {
  return (
    <div className="flex gap-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索平台…"
        data-testid="search-input"
        className="w-full max-w-xs rounded-md border border-card-border px-3 py-1.5 text-sm"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        data-testid="category-select"
        className="rounded-md border border-card-border px-2 py-1.5 text-sm"
      >
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}
