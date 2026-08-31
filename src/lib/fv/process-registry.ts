import { stmts } from './db';

/** 进程注册表（原 process-registry.js 移植） */

export interface RegistryEntry {
  id: string;
  type: 'agent' | 'hermes';
  provider: string;
  pid: number | null;
  process: unknown;
  kill: (() => void) | null;
  status: string;
  task: string;
  taskType: string;
  taskLabel: string;
  taskIcon: string;
  model: string;
  cwd: string;
  target: string;
  skill: string;
  fallbackChain: string[];
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  metadata: Record<string, unknown>;
}

const registry = new Map<string, RegistryEntry>();

export function register(id: string, entry: Partial<RegistryEntry>): string {
  registry.set(id, {
    id,
    type: entry.type ?? 'agent',
    provider: entry.provider ?? '',
    pid: entry.pid ?? null,
    process: entry.process ?? null,
    kill: entry.kill ?? null,
    status: 'running',
    task: entry.task ?? '',
    taskType: entry.taskType ?? '',
    taskLabel: entry.taskLabel ?? '',
    taskIcon: entry.taskIcon ?? '',
    model: entry.model ?? '',
    cwd: entry.cwd ?? '',
    target: entry.target ?? '',
    skill: entry.skill ?? '',
    fallbackChain: entry.fallbackChain ?? [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    metadata: entry.metadata ?? {},
  });
  return id;
}

export function unregister(id: string): RegistryEntry | undefined {
  const entry = registry.get(id);
  if (entry) {
    entry.status = 'removed';
    registry.delete(id);
  }
  return entry;
}

export function updateStatus(id: string, status: string, exitCode?: number): RegistryEntry | null {
  const entry = registry.get(id);
  if (!entry) return null;
  entry.status = status;
  if (exitCode !== undefined) entry.exitCode = exitCode;
  if (status === 'completed' || status === 'error' || status === 'stopped') {
    entry.finishedAt = new Date().toISOString();
  }
  return entry;
}

export function get(id: string): RegistryEntry | undefined {
  return registry.get(id);
}

export function list(filter: { type?: string; provider?: string; status?: string } = {}): RegistryEntry[] {
  let entries = Array.from(registry.values());
  if (filter.type) entries = entries.filter((e) => e.type === filter.type);
  if (filter.provider) entries = entries.filter((e) => e.provider === filter.provider);
  if (filter.status) entries = entries.filter((e) => e.status === filter.status);
  return entries;
}

export function listRunning(): RegistryEntry[] {
  return list({ status: 'running' });
}

export function kill(id: string): boolean {
  const entry = registry.get(id);
  if (!entry || !entry.kill) return false;
  try {
    entry.kill();
  } catch {
    // 进程可能已退出
  }
  updateStatus(id, 'stopped');
  return true;
}

export function killAll(): number {
  let count = 0;
  for (const [id, entry] of registry) {
    if (entry.status === 'running' && entry.kill) {
      try {
        entry.kill();
      } catch {
        // 忽略
      }
      updateStatus(id, 'stopped');
      count++;
    }
  }
  return count;
}

export function getStats(): Record<string, unknown> {
  const entries = Array.from(registry.values());
  const running = entries.filter((e) => e.status === 'running');
  const byProvider: Record<string, { running: number; total: number }> = {};
  for (const e of entries) {
    if (!byProvider[e.provider]) byProvider[e.provider] = { running: 0, total: 0 };
    byProvider[e.provider].total++;
    if (e.status === 'running') byProvider[e.provider].running++;
  }
  return {
    total: entries.length,
    running: running.length,
    byProvider,
    byType: entries.reduce((acc: Record<string, number>, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {}),
  };
}

/** 崩溃恢复：上次进程残留的 running/pending agent 全部置为 error */
export function recoverStaleAgents(): number {
  try {
    const stale = stmts.listActiveAgents();
    let recovered = 0;
    for (const a of stale) {
      if (!registry.has(String(a.id))) {
        stmts.updateAgentStatus({
          id: String(a.id), status: 'error', progress: 0, currentStep: 0,
          finishedAt: new Date().toISOString(), tokenUsage: 0,
        });
        recovered++;
      }
    }
    return recovered;
  } catch {
    return 0;
  }
}
