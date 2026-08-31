import { getSettings } from './crud';
import { refreshAllBalances } from './service';

const g = globalThis as { __workbenchTimer?: NodeJS.Timeout };

export function ensureAutoRefresh(): void {
  const { autoRefreshEnabled, refreshIntervalMin } = getSettings();
  if (!autoRefreshEnabled) {
    if (g.__workbenchTimer) {
      clearInterval(g.__workbenchTimer);
      g.__workbenchTimer = undefined;
    }
    return;
  }
  if (g.__workbenchTimer) return;
  const intervalMs = Math.max(refreshIntervalMin, 1) * 60_000;
  g.__workbenchTimer = setInterval(() => {
    void refreshAllBalances();
  }, intervalMs);
}
