import { USAGE_SOURCE_PATHS, usageCachePath } from './paths';
import { UsageCache } from './cache';
import { ACTIVE_SOURCES, type ActiveUsageSource, type SourceInfo, type UsageSource } from './types';
import { loadCcSwitchPricing, getPricingWithStatus } from './pricing';
import { scanSource, checkSourceAvailability } from './sources';
export { checkSourceAvailability };

export const SOURCE_LABELS: Record<UsageSource, string> = {
  'cc-switch': 'CC Switch',
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'opencode',
  hermes: 'hermes',
  openclaw: 'openclaw',
  zcode: 'zcode',
  dsh: 'dsh',
};

export const ALL_SOURCES: UsageSource[] = ACTIVE_SOURCES;

export interface IndexResult {
  sources: SourceInfo[];
  inserted: number;
}

export function runIndex(only?: ActiveUsageSource[]): IndexResult {
  const cache = UsageCache.open(usageCachePath());
  const ccPricing = loadCcSwitchPricing(USAGE_SOURCE_PATHS['cc-switch']());
  // 收集五层定价都 miss 的模型（UI 显示"未知定价"提示，而非静默 0）
  const unknownModels = new Set<string>();
  const pricing = (model: string) => {
    const r = getPricingWithStatus(model, ccPricing);
    if (r.source === 'unknown') unknownModels.add(model);
    return r.pricing;
  };
  const targets = only && only.length > 0 ? only : ACTIVE_SOURCES;
  const sources: SourceInfo[] = [];
  let inserted = 0;
  try {
    for (const id of targets) {
      // 路径不存在 → 不扫描，标 unavailable（避免无谓扫描 + 虚假 ready）
      const avail = checkSourceAvailability(id);
      if (!avail.ok) {
        sources.push({
          id,
          label: SOURCE_LABELS[id],
          status: 'unavailable',
          message: avail.reason,
          eventCount: cache.countEvents(id),
        });
        continue;
      }
      try {
        const cp = cache.getCheckpoint(id);
        const { events, checkpoint } = scanSource(id, cp, pricing);
        // 收集五层定价 miss 的模型：显式检查（不依赖各源是否调用 pricing 回调，
        // 如 cc-switch 直接用日志 cost、从不触发 pricing）
        for (const e of events) {
          if (getPricingWithStatus(e.model, ccPricing).source === 'unknown') unknownModels.add(e.model);
        }
        // openclaw rollup 行会被源反复改写（updated_at 变化触发重扫），dedupe 会
        // 丢弃更新后的值 → 该源用全量替换语义；其余源保持增量 dedupe
        inserted += cache.insertEvents(events, id === 'openclaw' || id === 'dsh' ? { replaceSource: id } : undefined);
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
    cache.setMeta('unknown_pricing_models', JSON.stringify([...unknownModels]));
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
    } catch (error) {
      // 后台失败不能成为 uncaught exception（否则进程崩溃）；记录后照常复位守卫
      console.error('Background usage index failed:', error);
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
