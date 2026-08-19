'use client';

import { useEffect, useRef } from 'react';
import { Settings, RefreshCw, Plus, FolderTree, Bot, GitBranch, LayoutDashboard, Sparkles, Wand2, History } from 'lucide-react';
import { toast } from 'sonner';
import { useConsoleStore } from '@/stores/console-store';
import { fvApi } from '@/lib/fv/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { DictKey } from '@/lib/i18n';
import type { ConsoleTab } from '@/lib/fv/types';
import { FileTab } from '@/components/console/FileTab';
import { AgentTab } from '@/components/console/AgentTab';
import { PipelinesTab } from '@/components/console/PipelinesTab';
import { DashboardTab } from '@/components/console/DashboardTab';
import { HermesTab } from '@/components/console/HermesTab';
import { MatchTab } from '@/components/console/MatchTab';
import { HistoryTab } from '@/components/console/HistoryTab';
import { SettingsDrawer } from '@/components/console/SettingsDrawer';
import { CreateAgentModal } from '@/components/console/CreateAgentModal';

const TABS: Array<{ id: ConsoleTab; labelKey: DictKey; icon: typeof Bot }> = [
  { id: 'files', labelKey: 'tab.files', icon: FolderTree },
  { id: 'agents', labelKey: 'common.agent', icon: Bot },
  { id: 'pipelines', labelKey: 'tab.pipelines', icon: GitBranch },
  { id: 'dashboard', labelKey: 'tab.dashboard', icon: LayoutDashboard },
  { id: 'hermes', labelKey: 'console.hermes', icon: Sparkles },
  { id: 'match', labelKey: 'tab.match', icon: Wand2 },
  { id: 'history', labelKey: 'tab.history', icon: History },
];

export default function ConsolePage() {
  const store = useConsoleStore();
  const cursorRef = useRef(0);
  const { t } = useI18n();

  // 首次挂载：全量拉数据
  useEffect(() => {
    void store.loadAgents();
    void store.loadTemplates();
    void store.loadPipelines();
    void store.loadTree();
    void store.loadSettings();
  }, [store]);

  // 事件轮询：驱动增量刷新（替代原 WS 推送）
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const { events, cursor, gap } = await fvApi.events(cursorRef.current);
        if (gap) {
          // 事件缓冲已裁剪、cursor 落后：中间事件已丢失，重置 cursor 从缓冲起点
          // 重放（applyEvent 是触发刷新语义，重复应用安全）
          cursorRef.current = 0;
        }
        if (events.length > 0) {
          cursorRef.current = cursor;
          for (const e of events) store.applyEvent(e.type);
        }
      } catch {
        // 服务不可用时静默
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [store]);

  // Agent 状态轮询（FileVision 原本就有 5s 轮询兜底）
  useEffect(() => {
    const timer = setInterval(() => void store.loadAgents(), 5000);
    return () => clearInterval(timer);
  }, [store]);

  // tab 激活时按需刷新
  useEffect(() => {
    const tab = store.activeTab;
    if (tab === 'files') void store.loadTree();
    if (tab === 'agents') void store.loadAgents();
    if (tab === 'pipelines') {
      void store.loadPipelines();
      void store.loadAgents();
    }
    if (tab === 'dashboard') {
      void store.loadStats();
      void store.loadAgents();
    }
    if (tab === 'hermes') void store.loadHermes();
    if (tab === 'match') void store.loadMatch();
    if (tab === 'history') void store.loadHistory();
  }, [store, store.activeTab]);

  const runningCount = store.agents.filter((a) => a.status === 'running').length;
  const pendingCount = store.agents.filter((a) => a.status === 'pending').length;

  const refreshAll = async () => {
    await Promise.all([
      store.loadAgents(),
      store.loadTree(),
      store.loadPipelines(),
      store.loadStats(),
      store.loadHistory(),
    ]);
    toast.success(t('console.refreshed'));
  };

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 pt-6 pb-3 flex items-end justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-heading">{t('console.title')}</h1>
          <div className="w-16 h-px bg-divider mt-2" />
          <p className="text-sm text-muted mt-2">
            {t('console.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
              runningCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-primary/10 text-primary'
            )}
          >
            <span className={cn('w-2 h-2 rounded-full', runningCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-primary/40')} />
            {runningCount > 0 ? t('console.agentsRunning', { count: runningCount }) : pendingCount > 0 ? t('console.agentsPending', { count: pendingCount }) : t('console.idle')}
          </span>
          <button
            onClick={() => void refreshAll()}
            className="p-2 hover:bg-primary/10 rounded-lg text-text-body"
            title={t('common.refresh')}
            data-testid="console-refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => store.setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
            data-testid="console-create-agent"
          >
            <Plus className="w-4 h-4" /> {t('console.newAgent')}
          </button>
          <button
            onClick={() => {
              void store.loadSettings();
              store.setSettingsOpen(true);
            }}
            className="p-2 hover:bg-primary/10 rounded-lg text-text-body"
            title={t('nav.settings')}
            data-testid="console-settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <nav className="px-6 flex gap-1 border-b border-divider" data-testid="console-tabs">
        {TABS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            onClick={() => store.setActiveTab(id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              store.activeTab === id
                ? 'text-primary border-primary'
                : 'text-secondary hover:text-primary border-transparent'
            )}
            data-testid={`console-tab-${id}`}
          >
            <Icon className="w-4 h-4" />
            {t(labelKey)}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto">
        {store.activeTab === 'files' && <FileTab />}
        {store.activeTab === 'agents' && <AgentTab />}
        {store.activeTab === 'pipelines' && <PipelinesTab />}
        {store.activeTab === 'dashboard' && <DashboardTab />}
        {store.activeTab === 'hermes' && <HermesTab />}
        {store.activeTab === 'match' && <MatchTab />}
        {store.activeTab === 'history' && <HistoryTab />}
      </div>

      {store.settingsOpen && <SettingsDrawer />}
      {store.createModalOpen && <CreateAgentModal />}
    </div>
  );
}
