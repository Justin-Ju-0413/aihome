'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { OverviewCards } from '@/components/usage/OverviewCards';
import { UsageFilters } from '@/components/usage/UsageFilters';
import { KLineChart } from '@/components/usage/KLineChart';
import { StatCharts } from '@/components/usage/StatCharts';
import { UsageTable } from '@/components/usage/UsageTable';
import type { Totals, UsageRange, KlineBucket, TableRow } from '@/lib/usage/aggregate';

interface EventsResponse {
  totals: Totals;
  kline: KlineBucket[];
  stats: { byDay: Array<{ day: string; cost: number; tokens: number; count: number }>; bySource: Array<{ source: string; cost: number; tokens: number; count: number }>; topModels: Array<{ model: string; cost: number; tokens: number; count: number }> };
  table: TableRow[];
  sourceStatus: Array<{ id: string; label: string; status: string; message?: string; eventCount?: number }>;
  unknownPricingModels?: string[];
}

async function fetchEvents(source: string, range: UsageRange, dimension: string): Promise<EventsResponse> {
  const res = await fetch(`/api/usage/events?source=${source}&range=${range}&dimension=${dimension}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'load failed');
  return json;
}

export default function UsagePage() {
  const [source, setSource] = useState('all');
  const [range, setRange] = useState<UsageRange>('24h');
  const [dimension, setDimension] = useState<'cost' | 'tokens'>('cost');
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await fetchEvents(source, range, dimension);
      setData(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }, [source, range, dimension]);

  useEffect(() => {
    fetchEvents(source, range, dimension)
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load usage data'))
      .finally(() => setLoading(false));
  }, [source, range, dimension]);

  const rescan = useCallback(async () => {
    setRescanning(true);
    try {
      const res = await fetch('/api/usage/rescan', { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) throw new Error('rescan failed');
      toast.success('Usage data refreshed');
      await load();
    } catch {
      toast.error('Rescan failed');
    } finally {
      setRescanning(false);
    }
  }, [load]);

  return (
    <main data-testid="usage-page" className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="font-heading text-3xl font-bold text-primary mb-6">Usage</h1>
      <UsageFilters
        source={source}
        range={range}
        onSourceChange={setSource}
        onRangeChange={setRange}
        onRescan={rescan}
        rescanning={rescanning}
      />
      {loading ? (
        <p className="text-sm text-secondary">Loading usage data…</p>
      ) : data ? (
        <>
          <div data-testid="usage-source-status" className="flex flex-wrap gap-2 mb-4">
            {data.sourceStatus.map((s) => (
              <span
                key={s.id}
                data-testid={`usage-status-${s.id}`}
                title={s.message ?? ''}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                  s.status === 'ready'
                    ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                    : s.status === 'unavailable'
                      ? 'border-neutral-200 text-neutral-500 bg-neutral-50'
                      : 'border-amber-200 text-amber-700 bg-amber-50'
                }`}
              >
                {s.label} · {s.status}
              </span>
            ))}
          </div>
          <OverviewCards totals={data.totals} />
          <div data-testid="usage-kline" className="glass-panel rounded-lg border border-divider p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading text-lg font-bold text-primary">K-line</h2>
              <button
                data-testid="usage-dimension"
                onClick={() => setDimension((d) => (d === 'cost' ? 'tokens' : 'cost'))}
                className="text-xs text-secondary hover:text-primary"
              >
                {dimension === 'cost' ? 'Amount' : 'Tokens'}
              </button>
            </div>
            <KLineChart buckets={data.kline} dimension={dimension} />
          </div>
          <div className="mb-6">
            <StatCharts stats={data.stats} />
          </div>
          <UsageTable rows={data.table} unknownPricingModels={data.unknownPricingModels ?? []} />
        </>
      ) : null}
    </main>
  );
}
