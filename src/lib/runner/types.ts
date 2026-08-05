export type RunStatus = 'running' | 'ok' | 'failed' | 'cancelled' | 'timeout';

export interface RunEvent {
  id: string;
  type: 'stdout' | 'stderr' | 'status' | 'error';
  data: string;
  at: string;
}

export interface Run {
  id: string;
  task: string;
  provider: string;
  model: string;
  cwd: string;
  status: RunStatus;
  exitCode: number | null;
  events: RunEvent[];
  startedAt: string;
  endedAt: string | null;
  pipelineId: string | null;
}

export interface PipelineStep {
  id: string;
  task: string;
  provider?: string;
  model?: string;
  cwd?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
  maxConcurrent: number;
}

export interface Schedule {
  id: string;
  name: string;
  cron: string;
  task: string;
  provider?: string;
  model?: string;
  enabled: boolean;
  lastRunAt: string | null;
}

export interface RunnerSettings {
  maxConcurrent: number;
  defaultDir: string;
  defaultProvider: string;
  timeoutMinutes: number;
  redactBeforeSend: boolean;
}

export interface RunHandle {
  run: Run;
  kill: () => boolean;
}
