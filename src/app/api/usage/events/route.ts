import { NextRequest, NextResponse } from 'next/server';
import { usageCachePath } from '@/lib/usage/paths';
import { UsageCache } from '@/lib/usage/cache';
import { ACTIVE_SOURCES, type ActiveUsageSource, type SourceInfo } from '@/lib/usage/types';
import { indexIfStale, SOURCE_LABELS, checkSourceAvailability } from '@/lib/usage/indexer';
import {
  buildKline, bucketMsForRange, rangeMs, totalsFor, groupBySource, groupByModel,
  byDay, buildTable, USAGE_RANGES,
  type UsageRange, type UsageDimension,
} from '@/lib/usage/aggregate';

const DIMENSIONS: UsageDimension[] = ['cost', 'tokens'];

export async function GET(request: NextRequest) {
  try {
    // fire-and-forget：过期则后台重索引，本次请求先返回缓存数据
    const stale = indexIfStale();
    const { searchParams } = new URL(request.url);
    const sourceParam = searchParams.get('source') ?? 'all';
    const rangeParam = searchParams.get('range') ?? '24h';
    const dimensionParam = searchParams.get('dimension') ?? 'cost';
    const range: UsageRange = USAGE_RANGES.includes(rangeParam as UsageRange)
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
      const monthStart = new Date(now);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const klineSince = now - Math.max(rangeMs(range), 30 * 24 * 3600_000);
      const totalsSince = Math.min(klineSince, monthStart.getTime());
      const events = cache.queryEvents(sources, klineSince);
      const totalsEvents = cache.queryEvents(ACTIVE_SOURCES, totalsSince);
      const bucketMs = bucketMsForRange(range);
      const windowStart = now - rangeMs(range);
      const windowEvents = events.filter((e) => e.timestamp >= windowStart);
      const lastRun = Number(cache.getMeta('last_index_ms')) || 0;
      const sourceStatus: SourceInfo[] = ACTIVE_SOURCES.map((id) => {
        const avail = checkSourceAvailability(id);
        const err = cache.getMeta(`last_index_${id}_error`);
        if (err !== null && err !== '' && Date.now() - lastRun < 10 * 60_000) {
          return {
            id,
            label: SOURCE_LABELS[id],
            status: 'error' as const,
            message: err,
            eventCount: cache.countEvents(id),
          };
        }
        return {
          id,
          label: SOURCE_LABELS[id],
          status: avail.ok ? ('ready' as const) : ('unavailable' as const),
          message: avail.ok ? undefined : avail.reason,
          eventCount: cache.countEvents(id),
        };
      });
      sourceStatus.push({
        id: 'openclaw',
        label: SOURCE_LABELS.openclaw,
        status: 'not-supported' as const,
        message: 'no local usage data',
      });
      const res = NextResponse.json({
        totals: totalsFor(totalsEvents, now),
        kline: buildKline(windowEvents, bucketMs, dimension),
        stats: {
          byDay: byDay(windowEvents),
          bySource: groupBySource(windowEvents),
          topModels: groupByModel(windowEvents),
        },
        table: buildTable(cache.queryEvents(sources, totalsSince), now),
        sourceStatus,
      });
      // 后台正在刷新时标记 stale，前端可据此提示
      res.headers.set('x-stale', stale ? 'true' : 'false');
      return res;
    } finally {
      cache.close();
    }
  } catch (error) {
    console.error('Usage events error:', error);
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 });
  }
}
