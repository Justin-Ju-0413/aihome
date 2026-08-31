'use client';

import { create } from 'zustand';
import { fvApi } from '@/lib/fv/api';
import { createReloadCoalescer } from '@/lib/fv/reload-coalesce';
import type {
  ConsoleTab,
  FvAgent,
  FvAgentDetail,
  FvFileNode,
  FvHistoryRow,
  FvPipeline,
  FvRunEntry,
  FvSetting,
  FvStats,
  FvTemplate,
} from '@/lib/fv/types';

/**
 * 事件驱动刷新统一走合并去抖：/api/fv/events 首次 cursor=0 会返回整段积压事件，
 * 若每条事件都在 applyEvent 里直接 loadAgents，秒级几十个请求风暴。
 * 同一数据源在 400ms 内只刷新一次。
 */
const eventReloader = createReloadCoalescer(400);

interface HermesPanelData {
  available: boolean;
  home: string;
  stats: Record<string, unknown> | null;
  sessions: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
}

interface ConsoleState {
  // 数据
  activeTab: ConsoleTab;
  agents: FvAgent[];
  selectedAgentDetail: FvAgentDetail | null;
  tree: FvFileNode[] | null;
  treeRoot: string;
  selectedFile: string | null;
  templates: FvTemplate[];
  pipelines: FvPipeline[];
  stats: FvStats | null;
  history: FvHistoryRow[];
  settings: FvSetting[];
  settingsCategories: Array<{ id: string; name: string; icon: string }>;
  hermes: HermesPanelData | null;
  matchHistory: Array<Record<string, unknown>>;
  runActive: FvRunEntry[];
  eventsCursor: number;
  // UI 状态
  settingsOpen: boolean;
  createModalOpen: boolean;
  loading: boolean;

  // 操作
  setActiveTab: (tab: ConsoleTab) => void;
  setSettingsOpen: (open: boolean) => void;
  setCreateModalOpen: (open: boolean) => void;
  setSelectedFile: (path: string | null) => void;
  setSelectedAgentDetail: (detail: FvAgentDetail | null) => void;
  loadAgents: () => Promise<void>;
  loadTree: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  loadPipelines: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadHermes: () => Promise<void>;
  loadMatch: () => Promise<void>;
  loadRunActive: () => Promise<void>;
  applyEvent: (type: string) => void;
  resetConsole: () => void;
}

export const useConsoleStore = create<ConsoleState>((set, get) => ({
  activeTab: 'files',
  agents: [],
  selectedAgentDetail: null,
  tree: null,
  treeRoot: '',
  selectedFile: null,
  templates: [],
  pipelines: [],
  stats: null,
  history: [],
  settings: [],
  settingsCategories: [],
  hermes: null,
  matchHistory: [],
  runActive: [],
  eventsCursor: 0,
  settingsOpen: false,
  createModalOpen: false,
  loading: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setCreateModalOpen: (open) => set({ createModalOpen: open }),
  setSelectedFile: (path) => set({ selectedFile: path }),
  setSelectedAgentDetail: (detail) => set({ selectedAgentDetail: detail }),

  loadAgents: async () => {
    try {
      const agents = await fvApi.agents();
      set({ agents });
    } catch {
      // 轮询失败静默，避免 toast 轰炸
    }
  },

  loadTree: async () => {
    try {
      const { root, tree } = await fvApi.tree();
      set({ treeRoot: root, tree });
    } catch {
      // 静默
    }
  },

  loadTemplates: async () => {
    try {
      set({ templates: await fvApi.templates() });
    } catch {
      // 静默
    }
  },

  loadPipelines: async () => {
    try {
      set({ pipelines: await fvApi.pipelines() });
    } catch {
      // 静默
    }
  },

  loadStats: async () => {
    try {
      set({ stats: await fvApi.stats() });
    } catch {
      // 静默
    }
  },

  loadHistory: async () => {
    try {
      set({ history: await fvApi.history(100) });
    } catch {
      // 静默
    }
  },

  loadSettings: async () => {
    try {
      const [settings, settingsCategories] = await Promise.all([
        fvApi.settings(),
        fvApi.settingsCategories(),
      ]);
      set({ settings, settingsCategories });
    } catch {
      // 静默
    }
  },

  loadHermes: async () => {
    try {
      const [available, stats, sessions, skills] = await Promise.all([
        fvApi.hermesAvailable(),
        fvApi.hermesStats().catch(() => ({ available: false })),
        fvApi.hermesSessions(20).catch(() => []),
        fvApi.hermesSkills().catch(() => []),
      ]);
      set({ hermes: { available: available.available, home: available.home, stats, sessions, skills } });
    } catch {
      // 静默
    }
  },

  loadMatch: async () => {
    try {
      const [matchHistory, runActive] = await Promise.all([
        fvApi.runHistory(8).catch(() => []),
        fvApi.runActive().catch(() => []),
      ]);
      set({ matchHistory, runActive });
    } catch {
      // 静默
    }
  },

  loadRunActive: async () => {
    try {
      set({ runActive: await fvApi.runActive() });
    } catch {
      // 静默
    }
  },

  applyEvent: (type) => {
    const s = get();
    // 事件类型 → 需要刷新的数据（统一走合并去抖，防积压事件风暴）
    if (type.startsWith('agent:') || type.startsWith('pipeline:')) {
      eventReloader.schedule('agents', () => void s.loadAgents());
      if (s.activeTab === 'pipelines') eventReloader.schedule('pipelines', () => void s.loadPipelines());
      if (s.activeTab === 'dashboard') eventReloader.schedule('stats', () => void s.loadStats());
    } else if (type === 'file:change') {
      if (s.activeTab === 'files') eventReloader.schedule('tree', () => void s.loadTree());
    } else if (type === 'history:new') {
      if (s.activeTab === 'history') eventReloader.schedule('history', () => void s.loadHistory());
    } else if (type === 'unified:started' || type === 'unified:completed' || type === 'unified:fallback') {
      eventReloader.schedule('runActive', () => void s.loadRunActive());
      if (s.activeTab === 'match') eventReloader.schedule('match', () => void s.loadMatch());
    } else if (type.startsWith('hermes:')) {
      eventReloader.schedule('runActive', () => void s.loadRunActive());
      if (s.activeTab === 'hermes') eventReloader.schedule('hermes', () => void s.loadHermes());
    } else if (type === 'settings:changed' || type === 'settings:reset') {
      eventReloader.schedule('settings', () => void s.loadSettings());
    }
  },

  resetConsole: () =>
    set({
      agents: [], selectedAgentDetail: null, tree: null, treeRoot: '', selectedFile: null,
      templates: [], pipelines: [], stats: null, history: [], settings: [], settingsCategories: [],
      hermes: null, matchHistory: [], runActive: [], eventsCursor: 0,
    }),
}));
