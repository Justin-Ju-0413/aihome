export type UsageSource =
  | 'cc-switch' | 'claude' | 'codex' | 'opencode' | 'hermes' | 'openclaw';
export type ActiveUsageSource = Exclude<UsageSource, 'openclaw'>;

export const ACTIVE_SOURCES: ActiveUsageSource[] = [
  'cc-switch', 'claude', 'codex', 'opencode', 'hermes',
];

export interface UsageEvent {
  source: ActiveUsageSource;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  latencyMs?: number;
  sessionId?: string;
  timestamp: number;
}

export type ScannedEvent = UsageEvent & { rawId: string };

export interface Checkpoint {
  ts: number;
  mtime: number;
}

export const EMPTY_CHECKPOINT: Checkpoint = { ts: 0, mtime: 0 };

export type SourceStatus = 'ready' | 'unavailable' | 'error' | 'not-supported';

export interface SourceInfo {
  id: UsageSource;
  label: string;
  path?: string;
  status: SourceStatus;
  message?: string;
  lastScanAt?: number;
  eventCount?: number;
}
