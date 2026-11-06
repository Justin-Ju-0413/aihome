'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Upload, Download } from 'lucide-react';
import type { SyncState } from '@/lib/sync/engine';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

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
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="font-heading text-xl font-semibold text-heading">{t('sync.centerRepo')}</h2>
        <span className="text-sm text-muted">{t('sync.summarySkills', { n: state.summary.total_skills })}</span>
        <span className="text-sm text-amber-600 dark:text-amber-400">{t('sync.summaryConflicts', { n: state.summary.conflict_count })}</span>
        <span className="text-sm text-muted">{t('sync.summaryEndpoints', { n: state.summary.endpoint_count })}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        {Object.entries(state.endpoints).map(([name, ep]) => (
          <Card key={name}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-heading">{name}</span>
              <Badge tone={ep.exists ? 'success' : 'danger'}>
                {ep.exists ? t('common.online') : t('sync.pathMissing')}
              </Badge>
            </div>
            <p className="text-xs text-muted truncate mb-2" title={ep.path}>{ep.path}</p>
            <p className="text-sm text-text-body">
              {t('sync.endpointStats', { count: ep.count, missing: ep.diff.missing, different: ep.diff.different, extra: ep.diff.extra })}
            </p>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => run('collect')} disabled={busy}>
          <Download size={16} /> collect
        </Button>
        <Button onClick={() => run('push')} disabled={busy}>
          <Upload size={16} /> push
        </Button>
        <label className="flex items-center gap-2 text-sm text-text-body cursor-pointer">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="accent-[var(--color-primary)]" />
          dry-run
        </label>
        <Button onClick={onChanged} disabled={busy} variant="ghost" size="sm">
          <RefreshCw size={16} /> {t('common.refresh')}
        </Button>
      </div>
    </section>
  );
}
