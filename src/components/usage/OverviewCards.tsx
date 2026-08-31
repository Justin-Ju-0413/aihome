'use client';

import { useI18n } from '@/lib/i18n';
import type { Totals } from '@/lib/usage/aggregate';

interface Props {
  totals: Totals;
}

function formatMoney(v: number): string {
  return `$${v.toFixed(2)}`;
}

export function OverviewCards({ totals }: Props) {
  const { t } = useI18n();
  const cards = [
    { label: t('usage.overviewToday'), value: formatMoney(totals.today), testId: 'usage-overview-today' },
    { label: t('usage.overviewWeek'), value: formatMoney(totals.week), testId: 'usage-overview-week' },
    { label: t('usage.overviewMonth'), value: formatMoney(totals.month), testId: 'usage-overview-month' },
    { label: t('usage.overviewRequests'), value: String(totals.requests), testId: 'usage-overview-requests' },
    { label: t('usage.overviewTokens'), value: String(totals.tokensInput + totals.tokensOutput), testId: 'usage-overview-tokens' },
  ];
  return (
    <section data-testid="usage-overview" className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      {cards.map((c, i) => (
        <div key={c.testId ?? i} data-testid={c.testId} className="glass-panel rounded-lg border border-divider p-4">
          <p className="text-xs font-medium tracking-widest text-secondary">{c.label}</p>
          <p className="font-heading text-xl font-bold text-primary mt-1">{c.value}</p>
        </div>
      ))}
    </section>
  );
}
