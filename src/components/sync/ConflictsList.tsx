'use client';

import type { SyncConflict } from '@/lib/sync/engine';

export function ConflictsList({ conflicts }: { conflicts: SyncConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <section>
        <h2 className="font-heading text-xl font-semibold mb-2">冲突</h2>
        <p className="text-sm text-secondary">无冲突</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="font-heading text-xl font-semibold mb-2">冲突（{conflicts.length}）</h2>
      <div className="border border-divider rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-(--color-card-bg) text-left">
            <tr>
              <th className="px-4 py-2">技能</th>
              <th className="px-4 py-2">版本</th>
              <th className="px-4 py-2">来源端</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((c) => (
              <tr key={c.name} className="border-t border-divider">
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2 text-secondary">{c.versions.join(' · ')}</td>
                <td className="px-4 py-2">{c.endpoint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
