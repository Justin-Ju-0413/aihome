'use client';

import dynamic from 'next/dynamic';
import { Info } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function GraphLoading() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-muted">{t('graph.page.loading')}</div>
    </div>
  );
}

const AgentGraph = dynamic(() => import('@/components/graph/AgentGraph'), {
  ssr: false,
  loading: () => <GraphLoading />,
});

export default function GraphPage() {
  const { t } = useI18n();
  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-8 text-center">
        <h1 className="font-heading text-3xl font-bold text-heading">{t('graph.page.title')}</h1>
        <div className="w-16 h-px bg-divider mx-auto mt-3" />
        <p className="text-sm text-muted mt-2">{t('graph.page.subtitle')}</p>

        {/* Info & Legend */}
        <div className="flex items-center justify-center gap-4 mt-6 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted glass-panel border border-card-border px-3 py-2 rounded-lg">
            <Info className="w-4 h-4" />
            <span>{t('graph.page.dragHint')}</span>
          </div>

          <div className="mx-2 w-px h-4 bg-divider" />

          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-8 h-0.5 bg-primary" />
            <span>{t('graph.page.legendCalls')}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-8 h-0.5" style={{ borderTop: '1.5px dashed #f59e0b' }} />
            <span>{t('graph.page.legendDepends')}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-8 h-0.5 bg-emerald-500" />
            <span>{t('graph.page.legendExtends')}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-8 h-0.5" style={{ borderTop: '1px dotted #8b5cf6' }} />
            <span>{t('graph.page.legendReferences')}</span>
          </div>

          <div className="mx-2 w-px h-4 bg-divider" />

          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-3 h-3 rounded border-2 border-primary bg-primary/5" />
            <span>{t('graph.page.legendAgent')}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="w-3 h-3 rounded border-2 border-secondary bg-secondary/5" />
            <span>{t('graph.page.legendSkill')}</span>
          </div>
        </div>
      </header>

      <div className="flex-1">
        <AgentGraph />
      </div>
    </div>
  );
}
