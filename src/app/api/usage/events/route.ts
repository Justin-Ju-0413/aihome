import { NextRequest, NextResponse } from 'next/server';
import { usageCachePath } from '@/lib/usage/paths';
import { UsageCache } from '@/lib/usage/cache';
import { ACTIVE_SOURCES, type ActiveUsageSource, type SourceInfo } from '@/lib/usage/types';
import { indexIfStale, SOURCE_LABELS } from '@/lib/usage/indexer';
import {
  buildKline, bucketMsForRange, rangeMs, totalsFor, groupBySource, groupByModel,
  byDay, buildTable,
  type UsageRange, type UsageDimension,
} from '@/lib/usage/aggregate';

const RANGES: UsageRange[] = ['5m', '15m', '30m', '1h', '24h', '7d', '30d'];
const DIMENSIONS: UsageDimension[] = ['cost', 'tokens'];

export async function GET(request: NextRequest) {
  try {
    indexIfStale();
    const { searchParams } = new URL(request.url);
    const sourceParam = searchParams.get('source') ?? 'all';
    const rangeParam = searchParams.get('range') ?? '24h';
    const dimensionParam = searchParams.get('dimension') ?? 'cost';
    const range: UsageRange = RANGES.includes(rangeParam as UsageRange)
      ? (rangeParam as UsageRange)
      : '24h';
    const dimension: UsageDimension = DIMENSIONS.includes(dimensionParam as UsageDimension)
      ? (dimensionParam as UsageDimension)
      : 'cost';
    const sources: ActiveUsageSource[] =
      sourceParam === 'all' || !ACTIVE_SOURCES.includes(sourceParam as ActiveUsageSource)
        ? ACTIVE_SOURCES
        : [sourceParam as ActiveUsageSource];

    const cache = UsageCache.open(usageCachePath());
    try {
      const now = Date.now();
      const since = now - Math.max(rangeMs(range), 30 * 24 * 3600_000);
      const events = cache.queryEvents(sources, since);
      const bucketMs = bucketMsForRange(range);
      const windowStart = now - rangeMs(range);
      const windowEvents = events.filter((e) => e.timestamp >= windowStart);
      const sourceStatus: SourceInfo[] = ACTIVE_SOURCES.map((id) => ({
        id,
        label: SOURCE_LABELS[id],
        status: 'ready' as const,
        eventCount: cache.countEvents(id),
      }));
      sourceStatus.push({
        id: 'openclaw',
        label: SOURCE_LABELS.openclaw,
        status: 'not-supported' as const,
        message: 'no local usage data',
      });
      return NextResponse.json({
        totals: totalsFor(events, now),
        kline: buildKline(windowEvents, bucketMs, dimension),
        stats: {
          byDay: byDay(windowEvents),
          bySource: groupBySource(windowEvents),
          topModels: groupByModel(windowEvents),
        },
        table: buildTable(events, now),
        sourceStatus,
      });
    } finally {
      cache.close();
    }
  } catch (error) {
    console.error('Usage events error:', error);
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 });
  }
}
