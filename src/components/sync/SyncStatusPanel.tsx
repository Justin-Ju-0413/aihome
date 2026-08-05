'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Upload, Download } from 'lucide-react';
import type { SyncState } from '@/lib/sync/engine';

interface Props {
  state: SyncState;
  onChanged: () => void;
}

export function SyncStatusPanel({ state, onChanged }: Props) {
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
        toast.error(data.error ?? `Failed to ${kind}`);
        return;
      }
      if (kind === 'collect') {
        const s = data.stats;
        toast.info(`collect: ${s.new} 新增, ${s.updated} 更新, ${s.conflict} 冲突, ${s.skipped} 跳过${dryRun ? '（dry-run）' : ''}`);
      } else {
        toast.info(`push: ${data.stats.updated} 更新, ${data.stats.skipped} 跳过${dryRun ? '（dry-run）' : ''}`);
      }
      if (!dryRun) onChanged();
    } catch {
      toast.error(`Failed to ${kind}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-heading text-xl font-semibold">中心仓库</h2>
        <span className="text-sm text-secondary">{state.summary.total_skills} 技能</span>
        <span className="text-sm text-amber-600">{state.summary.conflict_count} 冲突</span>
        <span className="text-sm text-secondary">{state.summary.endpoint_count} 端</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        {Object.entries(state.endpoints).map(([name, ep]) => (
          <div key={name} className="border border-divider rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${ep.exists ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {ep.exists ? '在线' : '路径缺失'}
              </span>
            </div>
            <p className="text-xs text-secondary truncate mb-2" title={ep.path}>{ep.path}</p>
            <p className="text-sm">
              {ep.count} 技能 · 缺 {ep.diff.missing} · 不同 {ep.diff.different} · 端独有 {ep.diff.extra}
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
          <RefreshCw size={16} /> 刷新
        </button>
      </div>
    </section>
  );
}
