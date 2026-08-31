'use client';

import { useCallback, useEffect, useState } from 'react';
import { HeartPulse, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { HealthIssue } from '@/lib/health';

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
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-semibold flex items-center gap-2">
        <HeartPulse className="w-5 h-5 text-primary" /> {t('health.title')}
      </h1>
      <p className="mb-4 text-sm text-gray-500">{t('health.subtitle')}</p>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={load}
          data-testid="health-refresh"
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4 inline mr-1" />
          {t('health.recheck')}
        </button>
        {healthy && (
          <span className="text-sm text-green-600 flex items-center gap-1" data-testid="health-ok">
            <CheckCircle2 className="w-4 h-4" /> {t('health.allGood')}
          </span>
        )}
      </div>

      {error && <div className="text-sm text-red-500">{t('health.fetchFailed')}</div>}

      {issues !== null && issues.length > 0 && (
        <ul data-testid="health-issues" className="space-y-2">
          {issues.map((i, idx) => (
            <li key={idx} className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <span className="font-medium flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                {i.type === 'unreadable_path' ? t('health.unreadablePath') : i.type === 'scan_error' ? t('health.scanError') : t('health.duplicateAgent')}
              </span>
              <span className="mt-1 block font-mono text-xs">{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
