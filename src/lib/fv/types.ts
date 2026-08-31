/** FileVision 前端共享类型（与 /api/fv/* 接口契约对应） */

export interface FvFileNode {
  name: string;
  type: 'folder' | 'file';
  path: string;
  children?: FvFileNode[];
  ext?: string;
  size?: string;
  modified?: string;
  agentIds?: string[];
  opsCount?: number;
}

export interface FvAgent {
  id: string;
  name: string;
  provider: string;
  status: string;
  description: string;
  target: string;
  cwd: string;
  prompt: string;
  progress: number;
  total_steps: number;
  current_step: number;
  pipeline_id: string | null;
  pipeline_order: number;
  next_agent_id: string | null;
  token_usage: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  steps: Array<{ id: number; step_num: number; name: string; status: string }>;
  logs?: Array<{ id: number; type: string; content: string; created_at: string }>;
  // 运行中 agent 由列表接口附带（实时活动数据）
  activities?: Array<{ type: string; file: string; tool: string; time: string }>;
  targetFiles?: string[];
  operationStats?: { read: number; edit: number; create: number; execute: number; tool: number };
  diffs?: Array<{ id: number; file_path: string; diff_content: string; created_at: string }>;
  snapshots?: number;
}

export interface FvAgentDetail extends FvAgent {
  diffs: Array<{ id: number; file_path: string; diff_content: string; created_at: string }>;
  snapshots: number;
  activities: Array<{ type: string; file: string; tool: string; time: string }>;
  targetFiles: string[];
  operationStats: { read: number; edit: number; create: number; execute: number; tool: number };
}

export interface FvPipeline {
  id: string;
  name: string;
  description: string;
  status: string;
  agent_ids: string;
  current_index: number;
  created_at: string;
  finished_at: string | null;
  agents: Array<{ id: string; name: string; status: string; progress: number; provider: string }>;
}

export interface FvTemplate {
  id: string;
  name: string;
  provider: string;
  description: string;
  prompt: string;
  steps: string[];
  variables: string[];
  category: string;
}

export interface FvSetting {
  key: string;
  value: string;
  category: string;
  type: 'select' | 'toggle' | 'text' | 'range';
  label: string;
  desc: string;
  options?: string[];
  min?: number;
  max?: number;
}

export interface FvHistoryRow {
  id: number;
  type: string;
  title: string;
  description: string;
  agent_id: string | null;
  file_path: string;
  created_at: string;
}

export interface FvStats {
  totalAgents: number;
  completed: number;
  errored: number;
  running: number;
  successRate: string;
  avgDurationMs: number;
  totalTokens: number;
  templates: number;
  pipelines: number;
}

export interface FvRunEntry {
  id: string;
  type: 'agent' | 'hermes';
  provider: string;
  pid: number | null;
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

export interface FvEvent {
  seq: number;
  ts: number;
  type: string;
  [key: string]: unknown;
}

export type ConsoleTab = 'files' | 'agents' | 'pipelines' | 'dashboard' | 'hermes' | 'match' | 'history';
