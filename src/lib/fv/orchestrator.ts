import { randomUUID } from 'crypto';
import { stmts } from './db';
import * as agentRunner from './agent-runner';
import * as hermesAdapter from './hermes-adapter';
import { convert, getTaskTypes } from './prompt-converter';
import { selectProvider, selectModel, getProviderProfiles, getFallbackChain } from './scheduler';
import { getValues } from './settings';
import * as processRegistry from './process-registry';
import { emitEvent, onEvent } from './events';

/** 一键匹配编排（原 agent-orchestrator.js 移植，ws 广播改为事件总线 + 输出缓冲轮询） */

export interface LaunchOptions {
  task: string;
  provider?: string;
  model?: string;
  target?: string;
  cwd?: string;
  skill?: string;
  steps?: string[];
  name?: string;
  pipelineId?: string | null;
}

export interface LaunchResult {
  runId: string;
  task: string;
  provider: string;
  providerName: string;
  model: string;
  taskType: string;
  taskLabel: string;
  taskIcon: string;
  prompt: string;
  target: string;
  cwd: string;
  skill: string;
  fallbackChain: string[];
  createdAt: string;
  agentId?: string;
  pid?: number;
  error?: string;
  message?: string;
}

// runId -> 输出行缓冲（替代 WS 流式推送，前端按 cursor 轮询）
const runOutputs = new Map<string, string[]>();
const MAX_OUTPUT_LINES = 1000;
// agentId -> runId（把 agent-runner 的输出事件汇入 run 输出缓冲）
const agentToRun = new Map<string, string>();

onEvent((e) => {
  if (e.type === 'agent:output') {
    const runId = agentToRun.get(String(e.agentId ?? ''));
    if (runId && typeof e.data === 'string') appendOutput(runId, e.data);
  }
});

function appendOutput(runId: string, text: string): void {
  const lines = text.split('\n');
  const buf = runOutputs.get(runId) ?? [];
  buf.push(...lines);
  if (buf.length > MAX_OUTPUT_LINES) buf.splice(0, buf.length - MAX_OUTPUT_LINES);
  runOutputs.set(runId, buf);
}

export function getRunOutput(runId: string, cursor: number): { lines: string[]; cursor: number } {
  const buf = runOutputs.get(runId) ?? [];
  const lines = buf.slice(cursor);
  return { lines, cursor: cursor + lines.length };
}

export function launch(options: LaunchOptions): LaunchResult {
  const vals = getValues();
  const maxConcurrent = parseInt(vals['agent.max_concurrent'] || '3');
  const runningCount = processRegistry.listRunning().length;

  if (runningCount >= maxConcurrent) {
    return { error: 'concurrency_limit', message: `已达最大并发数 ${maxConcurrent}` } as LaunchResult;
  }

  const resolvedProvider = options.provider || selectProvider(options.task, {
    model: options.model,
    target: options.target,
    skill: options.skill,
  });
  const converted = convert(options.task, resolvedProvider, {
    model: options.model,
    target: options.target,
    skill: options.skill,
    cwd: options.cwd,
  });
  const effectiveModel = options.model || selectModel(options.task, resolvedProvider);
  const defaultDir = vals['workspace.default_dir'] || process.cwd();
  const effectiveCwd = options.cwd || defaultDir;
  const fallbackChain = getFallbackChain(resolvedProvider);
  const runId = randomUUID();

  const launchInfo: LaunchResult = {
    runId,
    task: options.task,
    provider: resolvedProvider,
    providerName: getProviderProfiles()[resolvedProvider]?.name || resolvedProvider,
    model: effectiveModel,
    taskType: converted.taskType,
    taskLabel: converted.taskLabel,
    taskIcon: converted.taskIcon,
    prompt: converted.prompt,
    target: options.target || '',
    cwd: effectiveCwd,
    skill: options.skill || '',
    fallbackChain,
    createdAt: new Date().toISOString(),
  };

  emitEvent({ type: 'agent:launch', ...launchInfo });

  stmts.insertHistory({
    type: 'agent',
    title: `${converted.taskIcon} ${converted.taskLabel}: ${resolvedProvider}`,
    description: `${options.task.substring(0, 100)} → ${resolvedProvider}${effectiveModel ? '/' + effectiveModel : ''}`,
    agentId: runId,
    filePath: '',
  });

  if (resolvedProvider === 'hermes') {
    return launchHermes(launchInfo);
  }
  return launchClaudeCodex(launchInfo, { steps: options.steps, name: options.name, pipelineId: options.pipelineId ?? null });
}

function launchClaudeCodex(info: LaunchResult, opts: { steps?: string[]; name?: string; pipelineId?: string | null }): LaunchResult {
  const agentId = agentRunner.createAgent({
    name: opts.name || `${info.taskIcon} ${info.taskLabel}:${info.provider}`,
    provider: info.provider,
    description: info.task,
    target: info.target,
    cwd: info.cwd,
    prompt: info.prompt,
    steps: opts.steps || [],
    pipelineId: opts.pipelineId || null,
  });

  agentToRun.set(agentId, info.runId);

  processRegistry.register(info.runId, {
    type: 'agent',
    provider: info.provider,
    process: agentRunner.activeProcesses.get(agentId),
    kill: () => {
      agentToRun.delete(agentId);
      return agentRunner.stopAgent(agentId);
    },
    task: info.task,
    taskType: info.taskType,
    taskLabel: info.taskLabel,
    taskIcon: info.taskIcon,
    model: info.model,
    cwd: info.cwd,
    target: info.target,
    skill: info.skill,
    fallbackChain: info.fallbackChain,
    metadata: { agentId },
  });

  agentRunner.startAgent(agentId);

  const proc = agentRunner.activeProcesses.get(agentId);
  if (proc) {
    const entry = processRegistry.get(info.runId);
    if (entry) {
      entry.process = proc;
      entry.pid = proc.pid ?? null;
      entry.kill = () => proc.kill('SIGTERM');
    }
  }

  const result: LaunchResult = { ...info, agentId };
  emitEvent({ type: 'agent:started', ...result });
  emitEvent({ type: 'unified:started', ...result });
  return result;
}

function launchHermes(info: LaunchResult): LaunchResult {
  const proc = hermesAdapter.launchHermes(info.prompt, {
    model: info.model,
    skill: info.skill,
    cwd: info.cwd,
  });

  processRegistry.register(info.runId, {
    type: 'hermes',
    provider: 'hermes',
    pid: proc.pid,
    kill: proc.kill,
    task: info.task,
    taskType: info.taskType,
    taskLabel: info.taskLabel,
    taskIcon: info.taskIcon,
    model: info.model,
    cwd: info.cwd,
    target: info.target,
    skill: info.skill,
    fallbackChain: info.fallbackChain,
  });

  proc.onOutput((data) => {
    appendOutput(info.runId, data);
    emitEvent({ type: 'unified:output', runId: info.runId, provider: 'hermes', data });
  });
  proc.onError((data) => {
    emitEvent({ type: 'unified:error', runId: info.runId, provider: 'hermes', data });
  });
  proc.onClose((code) => {
    const status = code === 0 ? 'completed' : 'error';
    processRegistry.updateStatus(info.runId, status, code ?? undefined);

    if (status === 'error' && info.fallbackChain.length > 1) {
      handleFallback(info);
    } else {
      processRegistry.unregister(info.runId);
    }

    emitEvent({ type: 'unified:completed', runId: info.runId, provider: 'hermes', status, exitCode: code });
    stmts.insertHistory({
      type: 'agent',
      title: `${info.taskIcon} ${info.taskLabel} ${status === 'completed' ? '完成' : '出错'}`,
      description: `hermes exit=${code}`,
      agentId: info.runId,
      filePath: '',
    });
  });

  const result: LaunchResult = { ...info, pid: proc.pid ?? undefined };
  emitEvent({ type: 'unified:started', ...result });
  return result;
}

function handleFallback(info: LaunchResult): void {
  const nextProvider = info.fallbackChain[info.fallbackChain.indexOf(info.provider) + 1];
  if (!nextProvider) {
    processRegistry.unregister(info.runId);
    return;
  }

  emitEvent({ type: 'unified:fallback', runId: info.runId, fromProvider: info.provider, toProvider: nextProvider });

  const newModel = selectModel(info.task, nextProvider);

  launch({
    task: info.task,
    provider: nextProvider,
    model: newModel,
    target: info.target,
    cwd: info.cwd,
    skill: info.skill,
  });
}

export function abort(runId: string): boolean {
  const entry = processRegistry.get(runId);
  if (!entry) return false;
  const killed = processRegistry.kill(runId);
  if (killed) {
    emitEvent({ type: 'unified:completed', runId, provider: entry.provider, status: 'stopped', exitCode: -1 });
  }
  return killed;
}

export function getStatus(): Record<string, unknown> {
  return {
    registry: processRegistry.getStats(),
    providers: getProviderProfiles(),
    taskTypes: getTaskTypes(),
  };
}

export { processRegistry };
