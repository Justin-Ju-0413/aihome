'use client';
import { create } from 'zustand';
import type { Site, SiteInput, CheckStatus } from '@/lib/workbench/types';

export interface CurrentKeyView {
  id: number;
  label: string;
  provider: string;
  isCurrent: boolean;
  lastCheckStatus: CheckStatus;
  lastBalanceJson: string | null;
  lastCheckAt: string | null;
}

export interface SiteView extends Site {
  currentKey: CurrentKeyView | null;
}

type SiteInputWithId = Partial<SiteInput> & { id?: string };

interface WorkbenchState {
  sites: SiteView[];
  loaded: boolean;
  search: string;
  category: string;
  loadingBalance: Record<number, boolean>;
  load: () => Promise<void>;
  setSearch: (s: string) => void;
  setCategory: (c: string) => void;
  refreshBalance: (keyId: number) => Promise<void>;
  removeSite: (id: string) => Promise<void>;
  saveSite: (input: SiteInputWithId) => Promise<void>;
  saveKey: (siteId: string, input: { label: string; provider: string; key: string }) => Promise<void>;
  deleteKey: (keyId: number) => Promise<void>;
  setCurrentKey: (siteId: string, keyId: number) => Promise<void>;
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  sites: [],
  loaded: false,
  search: '',
  category: '全部',
  loadingBalance: {},

  async load() {
    const { sites } = await api<{ sites: SiteView[] }>('/api/workbench/sites');
    set({ sites, loaded: true });
  },

  setSearch: (search) => set({ search }),
  setCategory: (category) => set({ category }),

  async refreshBalance(keyId) {
    set((s) => ({ loadingBalance: { ...s.loadingBalance, [keyId]: true } }));
    try {
      await api(`/api/workbench/balance/${keyId}`, { method: 'POST' });
      await get().load();
    } finally {
      set((s) => {
        const loadingBalance = { ...s.loadingBalance };
        delete loadingBalance[keyId];
        return { loadingBalance };
      });
    }
  },

  async removeSite(id) {
    await api(`/api/workbench/sites/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await get().load();
  },

  async saveSite(input) {
    if (input.id) {
      await api(`/api/workbench/sites/${encodeURIComponent(input.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } else {
      await api('/api/workbench/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    }
    await get().load();
  },

  async saveKey(siteId, input) {
    await api('/api/workbench/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, ...input }),
    });
    await get().load();
  },

  async deleteKey(keyId) {
    await api(`/api/workbench/keys/${keyId}`, { method: 'DELETE' });
    await get().load();
  },

  async setCurrentKey(siteId, keyId) {
    await api(`/api/workbench/keys/${keyId}/set-current`, { method: 'POST' });
    await get().load();
  },
}));
