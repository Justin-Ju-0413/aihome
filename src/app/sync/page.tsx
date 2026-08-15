'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { SyncState } from '@/lib/sync/engine';
import { SyncStatusPanel } from '@/components/sync/SyncStatusPanel';
import { ConflictsList } from '@/components/sync/ConflictsList';
import { useI18n } from '@/lib/i18n';

interface LegacyInfo {
  present: boolean;
  migrated: boolean;
  copiedSkills?: number;
}

export default function SyncPage() {
  const { t } = useI18n();
  const [state, setState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('sync.statusLoadError'));
        return;
      }
      setState(data.state);
      const legacy: LegacyInfo | undefined = data.legacy;
      if (legacy?.migrated && legacy.copiedSkills !== undefined) {
        toast.success(t('sync.migrated', { n: legacy.copiedSkills }));
      }
    } catch {
      toast.error(t('sync.statusLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch sync status on mount
    loadStatus();
  }, [loadStatus]);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="font-heading text-3xl font-bold text-primary mb-6">Skill Sync</h1>
      {loading ? (
        <p className="text-sm text-secondary">{t('common.loading')}</p>
      ) : state ? (
        <>
          <SyncStatusPanel state={state} onChanged={loadStatus} />
          <ConflictsList conflicts={state.conflicts} />
        </>
      ) : null}
    </main>
  );
}
