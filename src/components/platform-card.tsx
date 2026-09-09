'use client';
import { ExternalLink, Pencil, RefreshCw, Settings2 } from 'lucide-react';
import BalanceBadge from './balance-badge';
import { useI18n } from '@/lib/i18n';
import { useWorkbenchStore } from '@/stores/workbench-store';
import type { SiteView } from '@/stores/workbench-store';

export default function PlatformCard({ site, onEdit, onConfigKey }: {
  site: SiteView; onEdit: (s: SiteView) => void; onConfigKey: (s: SiteView) => void;
}) {
  const { t } = useI18n();
  const refreshBalance = useWorkbenchStore((s) => s.refreshBalance);
  const initial = site.name.slice(0, 1).toUpperCase();
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
  const iconButton = 'inline-flex items-center gap-1 rounded-md border border-card-border glass-input px-2 py-1 text-xs font-medium text-text-body transition-colors hover:border-secondary hover:text-primary';
  return (
    <div data-testid={`site-card-${site.id}`} className="glass-panel rounded-xl border border-card-border p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
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
            <div className="text-xs text-muted">{categoryLabel(site.category)}</div>
          </div>
        </div>
        {site.isBuiltin && <span className="shrink-0 text-xs text-muted">{t('common.builtin')}</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <BalanceBadge currentKey={site.currentKey} />
        <div className="flex gap-1">
          <button onClick={() => window.open(site.url, '_blank', 'noopener')} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-primary/90">
            <ExternalLink size={12} /> {t('common.open')}
          </button>
          {site.currentKey
            ? (
              <button onClick={() => void refreshBalance(site.currentKey!.id)} className={iconButton} title={t('common.refresh')}>
                <RefreshCw size={12} />
              </button>
            )
            : (
              <button onClick={() => onConfigKey(site)} className={iconButton} title={t('common.configure')}>
                <Settings2 size={12} />
              </button>
            )}
          <button onClick={() => onEdit(site)} className={iconButton} title={t('common.edit')}>
            <Pencil size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
