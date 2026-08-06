'use client';

import { Fragment, useState } from 'react';
import type { TableRow } from '@/lib/usage/aggregate';

function costColor(v: number): string {
  if (v >= 50) return 'text-red-600';
  if (v >= 20) return 'text-amber-600';
  return 'text-emerald-600';
}

export function UsageTable({ rows }: { rows: TableRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (source: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <section data-testid="usage-table" className="rounded-lg border border-divider bg-white/80 p-8 text-center">
        <p className="text-sm text-secondary">
          No usage data yet — click Rescan after using your AI tools.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="usage-table" className="rounded-lg border border-divider bg-white/80 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs tracking-widest text-secondary border-b border-divider">
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3 text-right">24h Tokens</th>
            <th className="px-4 py-3 text-right">24h Cost</th>
            <th className="px-4 py-3 text-right">Month Tokens</th>
            <th className="px-4 py-3 text-right">Month Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = expanded.has(row.source);
            return (
              <Fragment key={row.source}>
                <tr className="border-b border-divider cursor-pointer hover:bg-neutral-50" onClick={() => toggle(row.source)}>
                  <td className="px-4 py-3 font-medium text-primary">
                    {open ? '▾' : '▸'} {row.source}
                  </td>
                  <td className="px-4 py-3 text-right text-secondary">{row.tokens24h.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right ${costColor(row.cost24h)}`}>${row.cost24h.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-secondary">{row.tokensMonth.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right ${costColor(row.costMonth)}`}>${row.costMonth.toFixed(2)}</td>
                </tr>
                {open &&
                  row.models.map((m) => (
                    <tr key={`${row.source}-${m.model}`} className="border-b border-divider bg-neutral-50/50 text-xs">
                      <td className="px-8 py-2 text-secondary">{m.model}</td>
                      <td className="px-4 py-2 text-right text-secondary">{m.tokens24h.toLocaleString()}</td>
                      <td className={`px-4 py-2 text-right ${costColor(m.cost24h)}`}>${m.cost24h.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-secondary">{m.tokensMonth.toLocaleString()}</td>
                      <td className={`px-4 py-2 text-right ${costColor(m.costMonth)}`}>${m.costMonth.toFixed(2)}</td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
