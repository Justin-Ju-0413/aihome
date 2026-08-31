'use client';

import { useState } from 'react';
import { X, Download, Upload, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useConsoleStore } from '@/stores/console-store';
import { fvApi } from '@/lib/fv/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { FvSetting } from '@/lib/fv/types';

function SettingControl({ setting }: { setting: FvSetting }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  const save = async (value: string) => {
    setSaving(true);
    setError(null);
    try {
      await fvApi.saveSetting(setting.key, value);
      void useConsoleStore.getState().loadSettings();
      toast.success(t('console.saved'), { duration: 1200 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-body">{setting.label}</span>
          <span className="text-[10px] text-muted">{setting.key}</span>
          {saving && <span className="text-[10px] text-muted">{t('console.saving')}</span>}
        </div>
        {setting.desc && <p className="text-xs text-muted mt-0.5">{setting.desc}</p>}
        {error && <p className="text-xs text-rose-500 mt-0.5">{error}</p>}
      </div>
      <div className="shrink-0">
        {setting.type === 'toggle' && (
          <button
            onClick={() => void save(setting.value === 'true' ? 'false' : 'true')}
            className={cn(
              'w-10 h-5 rounded-full relative transition-colors',
              setting.value === 'true' ? 'bg-primary' : 'bg-muted/30'
            )}
            role="switch"
            aria-checked={setting.value === 'true'}
          >
            <span className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
              setting.value === 'true' ? 'left-[22px]' : 'left-0.5'
            )} />
          </button>
        )}
        {setting.type === 'select' && (
          <select
            value={setting.value}
            onChange={(e) => void save(e.target.value)}
            className="px-2 py-1 border border-card-border rounded text-xs text-text-body glass-input"
          >
            {setting.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {setting.type === 'text' && (
          <input
            defaultValue={setting.value}
            onBlur={(e) => {
              if (e.target.value !== setting.value) void save(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-48 px-2 py-1 border border-card-border rounded text-xs text-text-body glass-input focus:outline-none focus:ring-2 focus:ring-accent"
          />
        )}
        {setting.type === 'range' && (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={setting.min}
              max={setting.max}
              value={Number(setting.value)}
              onChange={(e) => void save(e.target.value)}
              className="w-32 accent-[var(--color-primary,#0A4F9D)]"
            />
            <span className="text-xs text-muted w-10 text-right">{setting.value}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsDrawer() {
  const settings = useConsoleStore((s) => s.settings);
  const categories = useConsoleStore((s) => s.settingsCategories);
  const setSettingsOpen = useConsoleStore((s) => s.setSettingsOpen);
  const [activeCat, setActiveCat] = useState('appearance');
  const { t } = useI18n();

  const reset = async () => {
    if (!confirm(t('console.resetConfirm'))) return;
    try {
      await fvApi.resetSettings();
      void useConsoleStore.getState().loadSettings();
      toast.success(t('console.restoredDefault'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const doExport = async () => {
    try {
      const data = await fvApi.exportSettings();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fv-settings.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const result = await fvApi.importSettings(data);
      toast.success(t('console.importDone', { imported: result.imported, skipped: result.skipped }));
      void useConsoleStore.getState().loadSettings();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const catSettings = settings.filter((s) => s.category === activeCat);

  return (
    <div className="fixed inset-0 scrim z-50" onClick={() => setSettingsOpen(false)}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md glass-modal shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="settings-drawer"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
          <h3 className="font-heading font-semibold text-heading">{t('console.settingsTitle')}</h3>
          <button onClick={() => setSettingsOpen(false)} className="p-1 hover:bg-primary/10 rounded text-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-4 py-2 border-b border-divider overflow-x-auto">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs whitespace-nowrap',
                activeCat === c.id ? 'bg-primary/10 text-primary' : 'text-muted hover:text-primary'
              )}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto divide-y divide-divider">
          {catSettings.map((s) => <SettingControl key={s.key} setting={s} />)}
          {catSettings.length === 0 && <p className="text-xs text-muted p-4">{t('console.noSettings')}</p>}
        </div>

        <div className="px-4 py-3 border-t border-divider flex gap-2">
          <button onClick={() => void doExport()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-card-border text-xs text-text-body hover:bg-primary/5">
            <Download className="w-3 h-3" /> {t('common.export')}
          </button>
          <label className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-card-border text-xs text-text-body hover:bg-primary/5 cursor-pointer">
            <Upload className="w-3 h-3" /> {t('common.import')}
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
                e.target.value = '';
              }}
            />
          </label>
          <button onClick={() => void reset()} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50">
            <RotateCcw className="w-3 h-3" /> {t('common.restoreDefault')}
          </button>
        </div>
      </div>
    </div>
  );
}
