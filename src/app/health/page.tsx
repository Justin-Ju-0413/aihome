'use client';

import { useCallback, useEffect, useState } from 'react';
import { HeartPulse, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { HealthIssue } from '@/lib/health';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';

export default function HealthPage() {
  const { t } = useI18n();
  const [issues, setIssues] = useState<HealthIssue[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch('/api/health/workspace');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIssues(data.issues ?? []);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时拉取健康状态
    load();
  }, [load]);

  const healthy = issues !== null && issues.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-6 pb-10">
      <PageHeader
        title={<span className="flex items-center gap-2 justify-center"><HeartPulse className="w-6 h-6 text-primary" /> {t('health.title')}</span>}
        subtitle={t('health.subtitle')}
      />

      <div className="flex items-center justify-center gap-3 mb-6">
        <Button onClick={load} data-testid="health-refresh" variant="secondary" size="sm">
          <RefreshCw className="w-4 h-4" />
          {t('health.recheck')}
        </Button>
        {healthy && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1" data-testid="health-ok">
            <CheckCircle2 className="w-4 h-4" /> {t('health.allGood')}
          </span>
        )}
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-400 text-center mb-4">{t('health.fetchFailed')}</div>}

      {issues !== null && issues.length > 0 && (
        <ul data-testid="health-issues" className="space-y-2">
          {issues.map((i, idx) => (
            <li key={idx} className="glass-panel rounded-xl border border-amber-500/30 p-4 text-sm text-amber-700 dark:text-amber-300">
              <span className="font-medium flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                {i.type === 'unreadable_path' ? t('health.unreadablePath') : i.type === 'scan_error' ? t('health.scanError') : t('health.duplicateAgent')}
              </span>
              <span className="mt-1 block font-mono text-xs text-muted">{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
