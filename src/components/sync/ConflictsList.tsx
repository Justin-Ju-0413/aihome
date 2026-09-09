'use client';

import type { SyncConflict } from '@/lib/sync/engine';
import { useI18n } from '@/lib/i18n';
import { Card } from '@/components/ui/Card';

export function ConflictsList({ conflicts }: { conflicts: SyncConflict[] }) {
  const { t } = useI18n();
  if (conflicts.length === 0) {
    return (
      <section>
        <h2 className="font-heading text-xl font-semibold text-heading mb-2">{t('sync.conflict.title')}</h2>
        <p className="text-sm text-muted">{t('sync.conflict.none')}</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="font-heading text-xl font-semibold text-heading mb-2">{t('sync.conflict.titleWithCount', { count: conflicts.length })}</h2>
      <Card flush className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-primary/5 text-left">
            <tr>
              <th className="px-4 py-2 text-heading">{t('common.skill')}</th>
              <th className="px-4 py-2 text-heading">{t('common.version')}</th>
              <th className="px-4 py-2 text-heading">{t('sync.conflict.sourceEndpoint')}</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((c) => (
              <tr key={c.name} className="border-t border-divider">
                <td className="px-4 py-2 font-medium text-heading">{c.name}</td>
                <td className="px-4 py-2 text-muted">{c.versions.join(' · ')}</td>
                <td className="px-4 py-2 text-text-body">{c.endpoint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
