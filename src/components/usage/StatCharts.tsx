'use client';

interface Stats {
  byDay: Array<{ day: string; cost: number; tokens: number; count: number }>;
  bySource: Array<{ source: string; cost: number; tokens: number; count: number }>;
  topModels: Array<{ model: string; cost: number; tokens: number; count: number }>;
}

export function StatCharts({ stats }: { stats: Stats }) {
  const maxDay = Math.max(1, ...stats.byDay.map((d) => d.cost));
  const totalCost = Math.max(1e-9, stats.bySource.reduce((s, x) => s + x.cost, 0));
  return (
    <div data-testid="usage-stats" className="grid md:grid-cols-3 gap-4">
      <div className="rounded-lg border border-divider bg-white/80 p-4">
        <h3 className="text-sm font-semibold text-primary mb-2">Daily Spend</h3>
        {stats.byDay.length === 0 ? (
          <p className="text-xs text-secondary">No data</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {stats.byDay.map((d) => (
              <div
                key={d.day}
                title={`${d.day} · $${d.cost.toFixed(4)} · ${d.count} req`}
                className="flex-1 bg-indigo-500/70 hover:bg-indigo-500 rounded-t transition-colors"
                style={{ height: `${Math.max((d.cost / maxDay) * 100, 2)}%` }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="rounded-lg border border-divider bg-white/80 p-4">
        <h3 className="text-sm font-semibold text-primary mb-2">By Source</h3>
        {stats.bySource.length === 0 ? (
          <p className="text-xs text-secondary">No data</p>
        ) : (
          stats.bySource.map((s) => {
            const pct = (s.cost / totalCost) * 100;
            return (
              <div key={s.source} className="mb-2">
                <div className="flex justify-between text-xs text-secondary mb-0.5">
                  <span>{s.source}</span>
                  <span>${s.cost.toFixed(4)} · {pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-neutral-100 rounded-full">
                  <div className="h-2 bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="rounded-lg border border-divider bg-white/80 p-4">
        <h3 className="text-sm font-semibold text-primary mb-2">Top Models</h3>
        {stats.topModels.length === 0 ? (
          <p className="text-xs text-secondary">No data</p>
        ) : (
          <ol className="space-y-1">
            {stats.topModels.map((m, i) => (
              <li key={m.model} className="flex justify-between text-xs">
                <span className="text-secondary">{i + 1}. {m.model}</span>
                <span className="text-primary font-medium">${m.cost.toFixed(4)} · {m.count}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
