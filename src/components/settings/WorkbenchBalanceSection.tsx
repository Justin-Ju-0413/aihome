'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, KeyRound, RotateCcw, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/**
 * Workbench 余额设置区块（并入 AIHome /settings）。
 * 自动刷新定时器、全部刷新、清除全部 key、恢复内置清单。
 */
export function WorkbenchBalanceSection() {
  const { t } = useI18n();
  const [auto, setAuto] = useState(false);
  const [intervalMin, setIntervalMin] = useState(30);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/workbench/settings')
      .then((r) => r.json())
      .then(({ settings }) => {
        setAuto(settings.autoRefreshEnabled);
        setIntervalMin(settings.refreshIntervalMin);
      })
      .catch(() => setMsg(t('settings.balance.loadFailed')));
  }, [t]);

  async function saveSettings(patch: { autoRefreshEnabled?: boolean; refreshIntervalMin?: number }) {
    await fetch('/api/workbench/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setMsg(t('common.saved'));
    setTimeout(() => setMsg(''), 2000);
  }

  async function refreshAll() {
    setBusy(true);
    try {
      const r = await fetch('/api/workbench/balance/refresh-all', { method: 'POST' });
      const { summary } = await r.json();
      setMsg(t('settings.balance.refreshed', { checked: summary.checked, ok: summary.ok }));
    } finally {
      setBusy(false);
    }
  }

  async function clearKeys() {
    if (!confirm(t('settings.balance.clearConfirm'))) return;
    const r = await fetch('/api/workbench/keys/clear-all', { method: 'POST' });
    const { cleared } = await r.json();
    setMsg(t('settings.balance.cleared', { n: cleared }));
  }

  async function restoreBuiltins() {
    const r = await fetch('/api/workbench/sites/restore-builtins', { method: 'POST' });
    const { added } = await r.json();
    setMsg(t('settings.balance.restored', { n: added }));
  }

  return (
    <section className="glass-panel rounded-lg border border-card-border p-6">
      <h2 className="font-heading text-lg font-semibold text-heading mb-4">{t('settings.balance.title')}</h2>
      <p className="text-sm text-muted mb-4">{t('settings.balance.description')}</p>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-text-body">
          <input
            data-testid="settings-auto-refresh"
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              void saveSettings({ autoRefreshEnabled: e.target.checked });
            }}
            className="accent-primary"
          />
          {t('settings.balance.autoRefresh')}
        </label>
        <label className="flex items-center gap-2 text-sm text-text-body">
          {t('settings.balance.intervalMin')}
          <input
            data-testid="settings-interval"
            type="number"
            min={1}
            max={1440}
            value={intervalMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              setIntervalMin(v);
              if (v > 0) void saveSettings({ refreshIntervalMin: v });
            }}
            className="w-24 px-2 py-1 border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent text-text-body"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          data-testid="btn-refresh-all"
          onClick={() => void refreshAll()}
          disabled={busy}
          className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          {t('settings.balance.refreshAll')}
        </button>
        <button
          data-testid="btn-restore-builtins"
          onClick={() => void restoreBuiltins()}
          className="px-3 py-1.5 text-sm text-text-body border border-card-border rounded-lg hover:bg-primary/10 flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          {t('settings.balance.restoreBuiltins')}
        </button>
        <button
          data-testid="btn-clear-keys"
          onClick={() => void clearKeys()}
          className="px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {t('settings.balance.clearKeys')}
        </button>
      </div>

      {msg && <p data-testid="settings-msg" className="mt-3 text-sm text-text-body">{msg}</p>}
      <p className="mt-4 text-xs text-muted flex items-center gap-1">
        <KeyRound className="w-3 h-3" />
        {t('settings.balance.storageNote')}
      </p>
    </section>
  );
}
