export type CheckStatus = 'never' | 'ok' | 'invalid' | 'network' | 'rate_limited' | 'unsupported' | 'timeout' | 'error';

export type Provider = 'deepseek' | 'openai' | 'openrouter' | 'none';

export interface Site {
  id: string;
  name: string;
  url: string;
  category: string;
  tags: string[];
  iconUrl: string | null;
  notes: string;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SiteInput {
  name: string;
  url: string;
  category?: string;
  tags?: string[];
  iconUrl?: string | null;
  notes?: string;
}

export interface KeyRecord {
  id: number;
  siteId: string;
  label: string;
  provider: Provider;
  key: string;
  isCurrent: boolean;
  lastCheckStatus: CheckStatus;
  lastBalanceJson: string | null;
  lastCheckAt: string | null;
  createdAt: string;
}

export interface KeyView {
  id: number;
  siteId: string;
  label: string;
  provider: Provider;
  masked: string;
  isCurrent: boolean;
  lastCheckStatus: CheckStatus;
  lastBalanceJson: string | null;
  lastCheckAt: string | null;
}

export interface Settings {
  autoRefreshEnabled: boolean;
  refreshIntervalMin: number;
  lastFullRefreshAt: string | null;
}

export interface BalanceEntry {
  currency: string;
  total: string;
  note?: string;
}

export type BalanceResult =
  | { ok: true; balances: BalanceEntry[]; raw?: unknown }
  | { ok: false; error: 'invalid_key' | 'network' | 'unsupported' | 'rate_limited' | 'timeout' | 'error'; message: string };
