import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { usageCachePath, USAGE_SOURCE_PATHS } from '@/lib/usage/paths';
import { UsageCache } from '@/lib/usage/cache';
import { ACTIVE_SOURCES, type SourceInfo } from '@/lib/usage/types';
import { SOURCE_LABELS } from '@/lib/usage/indexer';
import { handleRouteError } from '@/lib/api-response';

export async function GET() {
  try {
    const cache = UsageCache.open(usageCachePath());
    const sources: SourceInfo[] = [];
    try {
      for (const id of ACTIVE_SOURCES) {
        const p = USAGE_SOURCE_PATHS[id]();
        sources.push({
          id,
          label: SOURCE_LABELS[id],
          path: p,
          status: existsSync(p) ? 'ready' : 'unavailable',
          message: existsSync(p) ? undefined : `not found: ${p}`,
          eventCount: cache.countEvents(id),
        });
      }
    } finally {
      cache.close();
    }
    return NextResponse.json({ sources });
  } catch (err) {
    return handleRouteError(err, 'Failed to load usage sources');
  }
}
