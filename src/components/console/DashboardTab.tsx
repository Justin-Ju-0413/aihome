'use client';

import { Bot, CheckCircle2, AlertCircle, Loader2, TrendingUp, Clock, Coins, FileText, GitBranch } from 'lucide-react';
import { useConsoleStore } from '@/stores/console-store';
import { useI18n } from '@/lib/i18n';

export function DashboardTab() {
  const stats = useConsoleStore((s) => s.stats);
  const agents = useConsoleStore((s) => s.agents);
  const { t } = useI18n();

  const cards = stats
    ? [
        { label: t('console.totalAgents'), value: stats.totalAgents, icon: Bot },
        { label: t('console.status.completed'), value: stats.completed, icon: CheckCircle2 },
        { label: t('console.status.running'), value: stats.running, icon: Loader2 },
        { label: t('console.status.error'), value: stats.errored, icon: AlertCircle },
        { label: t('console.successRate'), value: stats.successRate, icon: TrendingUp },
        { label: t('console.avgDuration'), value: stats.avgDurationMs > 0 ? `${(stats.avgDurationMs / 1000).toFixed(1)}s` : '—', icon: Clock },
        { label: t('console.totalTokens'), value: stats.totalTokens, icon: Coins },
        { label: t('console.totalTemplates'), value: stats.templates, icon: FileText },
        { label: t('console.totalPipelines'), value: stats.pipelines, icon: GitBranch },
      ]
    : [];

  return (
    <div className="p-6" data-testid="dashboard-tab">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="glass-panel rounded-lg border border-card-border p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <c.icon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted">{c.label}</p>
              <p className="font-heading text-xl font-bold text-heading">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <h3 className="font-heading font-semibold text-heading mt-8 mb-3">{t('console.recentAgents')}</h3>
      <div className="glass-panel rounded-lg border border-card-border divide-y divide-divider">
        {agents.slice(0, 5).map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className={a.status === 'running' ? 'text-emerald-500' : a.status === 'completed' ? 'text-primary' : a.status === 'error' ? 'text-rose-500' : 'text-muted'}>
              {a.status === 'running' ? '●' : a.status === 'completed' ? '✓' : a.status === 'error' ? '✗' : '○'}
            </span>
            <span className="text-text-body truncate">{a.name}</span>
            <span className="text-xs text-muted ml-auto">{a.provider}</span>
            <span className="text-xs text-muted w-12 text-right">{Math.round(a.progress)}%</span>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="px-4 py-8 text-center text-muted text-sm">{t('console.noAgents')}</div>
        )}
      </div>
    </div>
  );
}
