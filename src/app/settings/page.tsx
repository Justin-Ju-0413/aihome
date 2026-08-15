'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Save, Plus, Trash2, FolderOpen, RefreshCw, Download, HeartPulse } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { EndpointSettings } from '@/components/sync/EndpointSettings';
import { WorkbenchBalanceSection } from '@/components/settings/WorkbenchBalanceSection';
import type { WorkspaceConfig, AgentGroup } from '@/lib/types';

const DEFAULT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

export default function SettingsPage() {
  const { t } = useI18n();
  const { setGroups } = useAppStore();
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [newPath, setNewPath] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(DEFAULT_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace');
      const data = await res.json();
      setConfig(data);
    } catch {
      toast.error(t('settings.page.loadFailed'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch workspace config on mount
    loadConfig();
  }, [loadConfig]);

  const handleSaveConfig = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        toast.success(t('common.saved'));
      } else {
        toast.error(t('common.saveFailed'));
      }
    } catch {
      toast.error(t('common.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPath = () => {
    if (!newPath.trim() || !config) return;
    setConfig({
      ...config,
      paths: [...config.paths, newPath.trim()]
    });
    setNewPath('');
  };

  const handleRemovePath = (index: number) => {
    if (!config) return;
    setConfig({
      ...config,
      paths: config.paths.filter((_, i) => i !== index)
    });
  };

  const handleAddGroup = () => {
    if (!newGroupName.trim() || !config) return;
    const newGroup: AgentGroup = {
      id: newGroupName.toLowerCase().replace(/\s+/g, '-'),
      name: newGroupName.trim(),
      color: newGroupColor,
      description: ''
    };
    setConfig({
      ...config,
      groups: [...config.groups, newGroup]
    });
    setGroups([...config.groups, newGroup]);
    setNewGroupName('');
  };

  const handleRemoveGroup = (id: string) => {
    if (!config) return;
    setConfig({
      ...config,
      groups: config.groups.filter(g => g.id !== id)
    });
    setGroups(config.groups.filter(g => g.id !== id));
  };

  const handleRescan = async () => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      const data = await res.json();
      toast.success(t('settings.page.scanFound', { count: data.agents.length }));
      if (data.errors.length > 0) {
        data.errors.forEach((err: string) => toast.error(err));
      }
    } catch {
      toast.error(t('settings.page.scanFailed'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleExport = () => {
    if (!config) return;
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aihome-config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-8 text-center">
        <h1 className="font-heading text-3xl font-bold text-heading">{t('settings.page.title')}</h1>
        <div className="w-16 h-px bg-divider mx-auto mt-3" />
        <p className="text-sm text-muted mt-2">{t('settings.page.subtitle')}</p>

        <div className="flex items-center justify-center gap-3 mt-6">
          <Link
            href="/health"
            data-testid="settings-health-link"
            className="px-4 py-2 text-text-body hover:bg-primary/10 rounded-lg flex items-center gap-2 border border-card-border glass-input"
          >
            <HeartPulse className="w-4 h-4" />
            {t('common.healthCheck')}
          </Link>
          <button
            onClick={handleExport}
            className="px-4 py-2 text-text-body hover:bg-primary/10 rounded-lg flex items-center gap-2 border border-card-border glass-input"
          >
            <Download className="w-4 h-4" />
            {t('common.export')}
          </button>
          <button
            onClick={handleSaveConfig}
            disabled={isSaving || config?.readonly === true}
            data-testid="settings-save-btn"
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
            title={config?.readonly === true ? t('settings.page.readonlyTitle') : undefined}
          >
            <Save className="w-4 h-4" />
            {config?.readonly === true ? t('settings.page.readonlyMode') : isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
        {config?.readonly === true && (
          <p className="mt-2 text-xs text-amber-600" data-testid="readonly-banner">
            {t('settings.page.readonlyBanner')}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Workspace Info */}
        <section className="glass-panel rounded-lg border border-card-border p-6">
          <h2 className="font-heading text-lg font-semibold text-heading mb-4">{t('common.workspace')}</h2>
          <div>
            <label className="block text-sm font-medium text-text-body mb-2">{t('common.name')}</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="w-full max-w-md px-4 py-2 border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent text-text-body"
            />
          </div>
        </section>

        {/* Scan Paths */}
        <section className="glass-panel rounded-lg border border-card-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold text-heading">{t('settings.page.scanPaths')}</h2>
            <button
              onClick={handleRescan}
              disabled={isScanning}
              data-testid="settings-rescan-btn"
              className="px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
          </div>
          <p className="text-sm text-muted mb-4">{t('settings.page.scanPathsDesc')}</p>

          <div className="space-y-2 mb-4">
            {config.paths.map((path, index) => (
              <div key={index} className="flex items-center gap-3 bg-primary/5 rounded-lg px-4 py-3 border border-card-border">
                <FolderOpen className="w-4 h-4 text-muted" />
                <span className="flex-1 text-sm font-mono text-text-body">{path}</span>
                <button
                  onClick={() => handleRemovePath(index)}
                  className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/path/to/agents"
              className="flex-1 px-4 py-2 border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm text-text-body placeholder:text-muted"
              onKeyDown={(e) => e.key === 'Enter' && handleAddPath()}
            />
            <button
              onClick={handleAddPath}
              data-testid="settings-add-path-btn"
              className="px-4 py-2 glass-input text-text-body border border-card-border rounded-lg hover:bg-primary/10 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('common.add')}
            </button>
          </div>
        </section>

        {/* Groups */}
        <section className="glass-panel rounded-lg border border-card-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold text-heading">{t('settings.page.groups')}</h2>
          </div>
          <p className="text-sm text-muted mb-4">{t('settings.page.groupsDesc')}</p>

          <div className="space-y-2 mb-4">
            {config.groups.map((group) => (
              <div key={group.id} className="flex items-center gap-3 bg-primary/5 rounded-lg px-4 py-3 border border-card-border">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: group.color }} />
                <span className="flex-1 text-sm font-medium text-text-body">{group.name}</span>
                {group.id !== 'default' && (
                  <button
                    onClick={() => handleRemoveGroup(group.id)}
                    className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder={t('settings.page.groupNamePlaceholder')}
              className="flex-1 px-4 py-2 border border-card-border rounded-lg glass-input focus:outline-none focus:ring-2 focus:ring-accent text-sm text-text-body placeholder:text-muted"
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
            />
            <div className="flex gap-1">
              {DEFAULT_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setNewGroupColor(color)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    newGroupColor === color ? 'scale-110 border-primary' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              onClick={handleAddGroup}
              data-testid="settings-add-group-btn"
              className="px-4 py-2 glass-input text-text-body border border-card-border rounded-lg hover:bg-primary/10 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('common.add')}
            </button>
          </div>
        </section>

        {/* Workbench Balance */}
        <WorkbenchBalanceSection />

        {/* About */}
        <section className="glass-panel rounded-lg border border-card-border p-6">
          <h2 className="font-heading text-lg font-semibold text-heading mb-4">{t('settings.page.about')}</h2>
          <div className="text-sm text-muted space-y-1">
            <p>{t('settings.page.aboutTagline')}</p>
            <p>{t('settings.page.aboutVersion', { version: '1.0.0' })}</p>
            <p>{t('settings.page.aboutBuiltWith')}</p>
          </div>
        </section>

        <EndpointSettings />
      </div>
    </div>
  );
}
