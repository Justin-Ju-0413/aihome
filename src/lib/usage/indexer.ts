import { USAGE_SOURCE_PATHS, usageCachePath } from './paths';
import { UsageCache } from './cache';
import { ACTIVE_SOURCES, type ActiveUsageSource, type SourceInfo, type UsageSource } from './types';
import { loadCcSwitchPricing, getPricing } from './pricing';
import { scanSource, checkSourceAvailability } from './sources';
import { getProviderOverride } from '@/lib/vault';
export { checkSourceAvailability };

export const SOURCE_LABELS: Record<UsageSource, string> = {
  'cc-switch': 'CC Switch',
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'opencode',
  hermes: 'hermes',
  openclaw: 'openclaw',
};

export const ALL_SOURCES: UsageSource[] = [...ACTIVE_SOURCES, 'openclaw'];

export interface IndexResult {
  sources: SourceInfo[];
  inserted: number;
}

export function runIndex(only?: ActiveUsageSource[]): IndexResult {
  const cache = UsageCache.open(usageCachePath());
  const ccPricing = loadCcSwitchPricing(USAGE_SOURCE_PATHS['cc-switch']());
  const pricing = (model: string) => getPricing(model, ccPricing);
  const targets = only && only.length > 0 ? only : ACTIVE_SOURCES;
  const override = getProviderOverride();
  const sources: SourceInfo[] = [];
  let inserted = 0;
  try {
    for (const id of targets) {
      try {
        const cp = cache.getCheckpoint(id);
        const { events, checkpoint } = scanSource(id, cp, pricing);
        const overrideProvider = override[id as 'claude' | 'codex' | 'opencode'];
        const mapped = overrideProvider
          ? events.map((e) => ({ ...e, provider: overrideProvider }))
          : events;
        inserted += cache.insertEvents(mapped);
        cache.setCheckpoint(id, checkpoint);
        cache.setMeta(`last_index_${id}`, String(Date.now()));
        cache.setMeta(`last_index_${id}_error`, '');
        sources.push({
          id,
          label: SOURCE_LABELS[id],
          status: 'ready',
          lastScanAt: Date.now(),
          eventCount: cache.countEvents(id),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        cache.setMeta(`last_index_${id}_error`, message);
        sources.push({
          id,
          label: SOURCE_LABELS[id],
          status: 'error',
          message,
        });
      }
    }
    for (const id of ALL_SOURCES) {
      if (id === 'openclaw') {
        sources.push({
          id: 'openclaw',
          label: SOURCE_LABELS.openclaw,
          status: 'not-supported',
          message: 'no local usage data (upstream does not expose it)',
        });
        continue;
      }
      if (sources.some((s) => s.id === id)) continue;
      const avail = checkSourceAvailability(id);
      sources.push({
        id,
        label: SOURCE_LABELS[id],
        status: avail.ok ? 'ready' : 'unavailable',
        message: avail.reason,
        eventCount: cache.countEvents(id),
      });
    }
    cache.setMeta('last_index_ms', String(Date.now()));
  } finally {
    cache.close();
  }
  return { sources, inserted };
}

export function indexIfStale(maxAgeMs = 5 * 60_000): void {
  const cache = UsageCache.open(usageCachePath());
  let stale = true;
  try {
    const last = Number(cache.getMeta('last_index_ms')) || 0;
    stale = Date.now() - last > maxAgeMs;
  } finally {
    cache.close();
  }
  if (stale) runIndex();
}
