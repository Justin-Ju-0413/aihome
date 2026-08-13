'use client';

import type {
  FvAgent,
  FvAgentDetail,
  FvEvent,
  FvFileNode,
  FvHistoryRow,
  FvPipeline,
  FvRunEntry,
  FvSetting,
  FvStats,
  FvTemplate,
} from '@/lib/fv/types';

/** /api/fv/* 的 fetch 封装（客户端） */

export interface FvLaunchResult {
  runId: string;
  provider?: string;
  providerName?: string;
  model?: string;
  error?: string;
  message?: string;
  pid?: number;
}

async function fvFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}

const post = <T = unknown>(url: string, body?: unknown): Promise<T> =>
  fvFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

export const fvApi = {
  tree: (dir?: string) =>
    fvFetch<{ root: string; tree: FvFileNode[] }>(
      `/api/fv/tree${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`
    ),
  fileContent: (path: string) =>
    fvFetch<{ content: string | null; size?: number; modified?: string; error?: string }>(
      `/api/fv/files/content?path=${encodeURIComponent(path)}`
    ),
  watchFile: (path: string, agentIds: string[]) => post('/api/fv/files/watch', { path, agentIds }),

  agents: () => fvFetch<FvAgent[]>('/api/fv/agents'),
  createAgent: (body: Record<string, unknown>) => post<{ id: string }>('/api/fv/agents', body),
  agentDetail: (id: string) => fvFetch<FvAgentDetail>(`/api/fv/agents/${id}`),
  startAgent: (id: string) => post<{ pid: number }>(`/api/fv/agents/${id}/start`),
  stopAgent: (id: string) => post<{ ok: boolean }>(`/api/fv/agents/${id}/stop`),
  agentLogs: (id: string) => fvFetch<Array<Record<string, unknown>>>(`/api/fv/agents/${id}/logs`),
  agentDiffs: (id: string) => fvFetch<Array<Record<string, unknown>>>(`/api/fv/agents/${id}/diffs`),
  diffsByFile: (path: string) =>
    fvFetch<Array<Record<string, unknown>>>(`/api/fv/diffs/file?path=${encodeURIComponent(path)}`),
  rollback: (filePath: string) => post<{ ok: boolean }>('/api/fv/rollback', { filePath }),

  pipelines: () => fvFetch<FvPipeline[]>('/api/fv/pipelines'),
  createPipeline: (body: Record<string, unknown>) => post<{ id: string }>('/api/fv/pipelines', body),
  startPipeline: (id: string) => post<{ ok: boolean }>(`/api/fv/pipelines/${id}/start`),

  templates: () => fvFetch<FvTemplate[]>('/api/fv/templates'),
  applyTemplate: (id: string, variables: Record<string, string>) =>
    post<{ prompt: string; name: string; steps: string[] }>(`/api/fv/templates/${id}/apply`, { variables }),

  history: (limit = 100, type?: string) =>
    fvFetch<FvHistoryRow[]>(
      `/api/fv/history?limit=${limit}${type ? `&type=${encodeURIComponent(type)}` : ''}`
    ),

  stats: () => fvFetch<FvStats>('/api/fv/stats'),

  settings: () => fvFetch<FvSetting[]>('/api/fv/settings'),
  settingsCategories: () => fvFetch<Array<{ id: string; name: string; icon: string }>>('/api/fv/settings/categories'),
  saveSetting: (key: string, value: string) =>
    fvFetch(`/api/fv/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
  resetSettings: () => post<{ ok: boolean }>('/api/fv/settings/reset'),
  exportSettings: () => fvFetch<Record<string, unknown>>('/api/fv/settings/export'),
  importSettings: (data: unknown) =>
    post<{ imported: number; skipped: number; errors: Array<{ key: string; error: string }> }>('/api/fv/settings/import', data),

  hermesAvailable: () => fvFetch<{ available: boolean; home: string }>('/api/fv/hermes/available'),
  hermesStats: () => fvFetch<Record<string, unknown>>('/api/fv/hermes/stats'),
  hermesSessions: (limit = 20) => fvFetch<Array<Record<string, unknown>>>(`/api/fv/hermes/sessions?limit=${limit}`),
  hermesSessionDetail: (id: string) => fvFetch<Record<string, unknown>>(`/api/fv/hermes/sessions/${id}`),
  hermesSkills: () => fvFetch<Array<Record<string, unknown>>>('/api/fv/hermes/skills'),
  hermesLaunch: (body: { prompt: string; model?: string; skill?: string; cwd?: string }) =>
    post<FvLaunchResult>('/api/fv/hermes/launch', body),
  hermesAbort: (runId: string) => post<{ ok: boolean }>(`/api/fv/hermes/abort/${runId}`),

  run: (body: Record<string, unknown>) => post<FvLaunchResult>('/api/fv/run', body),
  runExplain: (body: Record<string, unknown>) => post<Record<string, unknown>>('/api/fv/run/explain', body),
  runComposite: (body: Record<string, unknown>) => post<Record<string, unknown>>('/api/fv/run/composite', body),
  runCapabilities: () => fvFetch<Record<string, Record<string, unknown>>>('/api/fv/run/capabilities'),
  runHistory: (limit = 8) => fvFetch<Array<Record<string, unknown>>>(`/api/fv/run/history?limit=${limit}`),
  runActive: () => fvFetch<FvRunEntry[]>('/api/fv/run/active'),
  runAbort: (runId: string) => post<{ ok: boolean }>(`/api/fv/run/abort/${runId}`),
  runOutput: (runId: string, cursor: number) =>
    fvFetch<{ lines: string[]; cursor: number }>(`/api/fv/runs/${runId}/output?cursor=${cursor}`),

  events: (cursor: number) => fvFetch<{ events: FvEvent[]; cursor: number }>(`/api/fv/events?cursor=${cursor}`),
};
