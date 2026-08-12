import { USAGE_SOURCE_PATHS, usageCachePath } from './paths';
import { UsageCache } from './cache';
import { ACTIVE_SOURCES, type ActiveUsageSource, type SourceInfo, type UsageSource } from './types';
import { loadCcSwitchPricing, getPricing } from './pricing';
import { scanSource, checkSourceAvailability } from './sources';
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
  const sources: SourceInfo[] = [];
  let inserted = 0;
  try {
    for (const id of targets) {
      try {
        const cp = cache.getCheckpoint(id);
        const { events, checkpoint } = scanSource(id, cp, pricing);
        inserted += cache.insertEvents(events);
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
    // 每轮索引后执行保留清理（防 events 表无限膨胀）
    cache.purgeExpired();
  } finally {
    cache.close();
  }
  return { sources, inserted };
}

// 后台重索引并发守卫：同一进程内同一时刻只跑一个任务，重复触发排队合并
let backgroundRunning = false;
let backgroundQueued = false;

export function triggerBackgroundIndex(): void {
  if (backgroundRunning) {
    backgroundQueued = true;
    return;
  }
  backgroundRunning = true;
  setImmediate(() => {
    try {
      runIndex();
    } finally {
      backgroundRunning = false;
      if (backgroundQueued) {
        backgroundQueued = false;
        triggerBackgroundIndex();
      }
    }
  });
}

/**
 * 惰性索引改为 fire-and-forget：先读缓存立即返回，过期时后台重索引。
 * 返回 true 表示数据可能陈旧、后台正在刷新（调用方应带 x-stale 响应头）。
 */
export function indexIfStale(maxAgeMs = 5 * 60_000): boolean {
  const cache = UsageCache.open(usageCachePath());
  let stale: boolean;
  try {
    const last = Number(cache.getMeta('last_index_ms')) || 0;
    stale = Date.now() - last > maxAgeMs;
  } finally {
    cache.close();
  }
  if (stale) triggerBackgroundIndex();
  return stale;
}
