/**
 * 事件驱动刷新的合并去抖器。
 *
 * 背景：/api/fv/events 首次以 cursor=0 拉取时会返回整段积压事件；若每条事件都
 * 触发一次 loadAgents()，会造成秒级几十个请求的风暴（实测 /console 一次 3s 内
 * 同一 API 被拉 44 次）。此处把"同一数据源(key)的刷新"合并为一次，且可叠加去抖，
 * 高频事件只触发最终一次刷新。
 */
export interface ReloadCoalescer {
  schedule(key: string, fn: () => void): void;
  cancel(key: string): void;
  pendingCount(): number;
}

export function createReloadCoalescer(debounceMs = 400): ReloadCoalescer {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(key, fn) {
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fn();
        }, debounceMs),
      );
    },
    cancel(key) {
      const t = timers.get(key);
      if (t) {
        clearTimeout(t);
        timers.delete(key);
      }
    },
    pendingCount() {
      return timers.size;
    },
  };
}
