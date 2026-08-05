'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { SyncState } from '@/lib/sync/engine';
import { SyncStatusPanel } from '@/components/sync/SyncStatusPanel';
import { ConflictsList } from '@/components/sync/ConflictsList';

interface LegacyInfo {
  present: boolean;
  migrated: boolean;
  copiedSkills?: number;
}

export default function SyncPage() {
  const [state, setState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to load sync status');
        return;
      }
      setState(data.state);
      const legacy: LegacyInfo | undefined = data.legacy;
      if (legacy?.migrated && legacy.copiedSkills !== undefined) {
        toast.success(`已从 ~/skill-sync 迁移 ${legacy.copiedSkills} 个技能到 ~/.aihome/repo（旧目录保留，可手动删除）`);
      }
    } catch {
      toast.error('Failed to load sync status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch sync status on mount
    loadStatus();
  }, [loadStatus]);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="font-heading text-3xl font-bold text-primary mb-6">Skill Sync</h1>
      {loading ? (
        <p className="text-sm text-secondary">加载中…</p>
      ) : state ? (
        <>
          <SyncStatusPanel state={state} onChanged={loadStatus} />
          <ConflictsList conflicts={state.conflicts} />
        </>
      ) : null}
    </main>
  );
}
