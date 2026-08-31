'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Upload, Download } from 'lucide-react';
import type { SyncState } from '@/lib/sync/engine';
import { useI18n } from '@/lib/i18n';

interface Props {
  state: SyncState;
  onChanged: () => void;
}

export function SyncStatusPanel({ state, onChanged }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  const run = async (kind: 'collect' | 'push') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sync/${kind}?dryRun=${dryRun}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('sync.runFailed', { kind }));
        return;
      }
      if (kind === 'collect') {
        const s = data.stats;
        toast.info(`${t('sync.collectResult', { newCount: s.new, updated: s.updated, conflict: s.conflict, skipped: s.skipped })}${dryRun ? t('sync.dryRunSuffix') : ''}`);
      } else {
        toast.info(`${t('sync.pushResult', { updated: data.stats.updated, skipped: data.stats.skipped })}${dryRun ? t('sync.dryRunSuffix') : ''}`);
      }
      if (!dryRun) onChanged();
    } catch {
      toast.error(t('sync.runFailed', { kind }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-heading text-xl font-semibold">{t('sync.centerRepo')}</h2>
        <span className="text-sm text-secondary">{t('sync.summarySkills', { n: state.summary.total_skills })}</span>
        <span className="text-sm text-amber-600">{t('sync.summaryConflicts', { n: state.summary.conflict_count })}</span>
        <span className="text-sm text-secondary">{t('sync.summaryEndpoints', { n: state.summary.endpoint_count })}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        {Object.entries(state.endpoints).map(([name, ep]) => (
          <div key={name} className="border border-divider rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${ep.exists ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {ep.exists ? t('common.online') : t('sync.pathMissing')}
              </span>
            </div>
            <p className="text-xs text-secondary truncate mb-2" title={ep.path}>{ep.path}</p>
            <p className="text-sm">
              {t('sync.endpointStats', { count: ep.count, missing: ep.diff.missing, different: ep.diff.different, extra: ep.diff.extra })}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => run('collect')}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
        >
          <Download size={16} /> collect
        </button>
        <button
          onClick={() => run('push')}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
        >
          <Upload size={16} /> push
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          dry-run
        </label>
        <button onClick={onChanged} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary">
          <RefreshCw size={16} /> {t('common.refresh')}
        </button>
      </div>
    </section>
  );
}
