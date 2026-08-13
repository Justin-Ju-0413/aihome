'use client';

import { USAGE_RANGES, type UsageRange } from '@/lib/usage/aggregate';

export const SOURCE_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'cc-switch', label: 'CC Switch' },
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'opencode', label: 'opencode' },
  { id: 'hermes', label: 'hermes' },
  { id: 'openclaw', label: 'openclaw' },
];

interface Props {
  source: string;
  range: UsageRange;
  onSourceChange: (s: string) => void;
  onRangeChange: (r: UsageRange) => void;
  onRescan: () => void;
  rescanning: boolean;
}

export function UsageFilters({ source, range, onSourceChange, onRangeChange, onRescan, rescanning }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex gap-1">
        {SOURCE_OPTIONS.map((s) => (
          <button
            key={s.id}
            data-testid={`usage-source-${s.id}`}
            onClick={() => onSourceChange(s.id)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              source === s.id
                ? 'bg-primary text-white border-primary'
                : 'border-divider text-secondary hover:text-primary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {USAGE_RANGES.map((r) => (
          <button
            key={r}
            data-testid={`usage-range-${r}`}
            onClick={() => onRangeChange(r)}
            className={`px-2 py-1.5 text-xs rounded-md border transition-colors ${
              range === r
                ? 'bg-primary text-white border-primary'
                : 'border-divider text-secondary hover:text-primary'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <button
        data-testid="usage-rescan"
        onClick={onRescan}
        disabled={rescanning}
        className="ml-auto px-3 py-1.5 text-sm rounded-md border border-divider text-secondary hover:text-primary disabled:opacity-50"
      >
        {rescanning ? 'Scanning…' : 'Rescan'}
      </button>
    </div>
  );
}
