'use client';

import type { Totals } from '@/lib/usage/aggregate';

interface Props {
  totals: Totals;
}

function formatMoney(v: number): string {
  return `$${v.toFixed(2)}`;
}

export function OverviewCards({ totals }: Props) {
  const cards = [
    { label: 'Today', value: formatMoney(totals.today), testId: 'usage-overview-today' },
    { label: 'This Week', value: formatMoney(totals.week), testId: 'usage-overview-week' },
    { label: 'This Month', value: formatMoney(totals.month), testId: 'usage-overview-month' },
    { label: 'Requests', value: String(totals.requests), testId: 'usage-overview-requests' },
    { label: 'Tokens', value: String(totals.tokensInput + totals.tokensOutput), testId: 'usage-overview-tokens' },
  ];
  return (
    <section data-testid="usage-overview" className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} data-testid={c.testId} className="rounded-lg border border-divider bg-white/80 p-4">
          <p className="text-xs font-medium tracking-widest text-secondary">{c.label}</p>
          <p className="font-heading text-xl font-bold text-primary mt-1">{c.value}</p>
        </div>
      ))}
    </section>
  );
}
