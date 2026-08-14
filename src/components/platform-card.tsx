'use client';
import BalanceBadge from './balance-badge';
import { useWorkbenchStore } from '@/stores/workbench-store';
import type { SiteView } from '@/stores/workbench-store';

export default function PlatformCard({ site, onEdit, onConfigKey }: {
  site: SiteView; onEdit: (s: SiteView) => void; onConfigKey: (s: SiteView) => void;
}) {
  const refreshBalance = useWorkbenchStore((s) => s.refreshBalance);
  const initial = site.name.slice(0, 1).toUpperCase();
  return (
    <div data-testid={`site-card-${site.id}`} className="flex flex-col gap-2 glass-panel rounded-xl border border-card-border p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {site.iconUrl
            ? (
              // eslint-disable-next-line @next/next/no-img-element -- 用户自定义远程图标，不适合 next/image remotePatterns
              <img src={site.iconUrl} alt="" className="h-8 w-8 rounded-lg" referrerPolicy="no-referrer" />
            )
            : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{initial}</div>
            )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-heading">{site.name}</div>
            <div className="text-xs text-body">{site.category}</div>
          </div>
        </div>
        <span className="shrink-0 text-xs text-body">{site.isBuiltin ? '内置' : ''}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <BalanceBadge currentKey={site.currentKey} />
        <div className="flex gap-1">
          <button onClick={() => window.open(site.url, '_blank', 'noopener')} className="rounded-md bg-primary px-2 py-1 text-xs text-white hover:bg-primary/90">打开</button>
          {site.currentKey
            ? (
              <button
                onClick={() => void refreshBalance(site.currentKey!.id)}
                className="rounded-md border border-card-border px-2 py-1 text-xs hover:bg-primary/5"
              >
                刷新
              </button>
            )
            : (
              <button onClick={() => onConfigKey(site)} className="rounded-md border border-card-border px-2 py-1 text-xs hover:bg-primary/5">配置</button>
            )}
          <button onClick={() => onEdit(site)} className="rounded-md border border-card-border px-2 py-1 text-xs hover:bg-primary/5">编辑</button>
        </div>
      </div>
    </div>
  );
}
