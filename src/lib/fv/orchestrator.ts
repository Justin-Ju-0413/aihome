import { randomUUID } from 'crypto';
import { stmts } from './db';
import * as agentRunner from './agent-runner';
import * as hermesAdapter from './hermes-adapter';
import { convert, getTaskTypes } from './prompt-converter';
import { selectProvider, selectModel, getProviderProfiles, getFallbackChain } from './scheduler';
import { getValues } from './settings';
import * as processRegistry from './process-registry';
import type { RegistryEntry } from './process-registry';
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
  /** 内部续跑字段：fallback 时由 handleFallback 传入（API 路由不暴露） */
  runId?: string;
  fallbackChain?: string[];
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
    return;
  }
  // agent 生命周期收尾：失败触发回退，成功/停止/链尽则清理并广播 unified:completed
  if (e.type === 'agent:complete' || e.type === 'agent:error') {
    const agentId = String(e.agentId ?? '');
    const runId = agentToRun.get(agentId);
    if (!runId) return;
    const entry = processRegistry.get(runId);
    // metadata.agentId 不匹配 ⇒ 该事件属于已被回退取代的旧 agent，晚到事件直接忽略
    if (!entry || entry.metadata?.agentId !== agentId) return;

    const status = e.type === 'agent:error' ? 'error' : String(e.status ?? 'error');
    if (status === 'stopped') {
      processRegistry.unregister(runId);
      agentToRun.delete(agentId);
      emitEvent({ type: 'unified:completed', runId, provider: entry.provider, status: 'stopped', exitCode: -1 });
      return;
    }

    processRegistry.updateStatus(runId, status, status === 'error' ? -1 : 0);
    if (status === 'error' && handleFallback(entry, entry.fallbackChain)) {
      agentToRun.delete(agentId);
      return;
    }
    processRegistry.unregister(runId);
    agentToRun.delete(agentId);
    emitEvent({ type: 'unified:completed', runId, provider: entry.provider, status, exitCode: status === 'error' ? -1 : 0 });
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
  // fallback 续跑时继承原链单向消费；首次启动按 provider 重建链
  const fallbackChain = options.fallbackChain ?? getFallbackChain(resolvedProvider);
  // fallback 续跑复用同一 runId：输出缓冲与前端轮询连续，不被回退打断
  const runId = options.runId ?? randomUUID();

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
    metadata: { agentId, name: opts.name ?? null, steps: opts.steps ?? [], pipelineId: opts.pipelineId ?? null },
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
    // fallback 复用 runId 后闭包里的 info.provider 已过期，以 registry 当前条目为准
    const entry = processRegistry.get(info.runId);
    const provider = entry?.provider ?? info.provider;
    const status = code === 0 ? 'completed' : 'error';
    processRegistry.updateStatus(info.runId, status, code ?? undefined);

    if (status === 'error') {
      const chain = entry?.fallbackChain ?? info.fallbackChain;
      if (entry && handleFallback(entry, chain)) {
        // 已回退：新 provider 以同一 runId 接管，由新 run 广播后续事件
      } else {
        processRegistry.unregister(info.runId);
        emitEvent({ type: 'unified:completed', runId: info.runId, provider, status, exitCode: code });
      }
    } else {
      processRegistry.unregister(info.runId);
      emitEvent({ type: 'unified:completed', runId: info.runId, provider, status, exitCode: code });
    }

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

/**
 * 链消费：返回 provider 在链中的下一个回退目标；链尾/不在链中返回 null（终止）。
 * 链单向推进，杜绝 claude↔codex 互指造成的无限循环。
 */
export function nextFallbackProvider(chain: string[], provider: string): string | null {
  const idx = chain.indexOf(provider);
  if (idx === -1 || idx + 1 >= chain.length) return null;
  return chain[idx + 1];
}

/**
 * 失败回退：沿原链单向推进并复用同一 runId 重启任务。
 * 返回 true 表示已触发回退；false 表示链已尽，调用方负责清理并广播 unified:completed。
 */
function handleFallback(entry: RegistryEntry, chain: string[]): boolean {
  const nextProvider = nextFallbackProvider(chain, entry.provider);
  if (!nextProvider) return false;

  // 移除旧条目；新 provider 以同一 runId 重新注册，输出缓冲与前端轮询连续
  processRegistry.unregister(entry.id);
  emitEvent({ type: 'unified:fallback', runId: entry.id, fromProvider: entry.provider, toProvider: nextProvider });

  const newModel = selectModel(entry.task, nextProvider);

  const relaunched = launch({
    task: entry.task,
    provider: nextProvider,
    model: newModel,
    target: entry.target,
    cwd: entry.cwd,
    skill: entry.skill,
    name: entry.metadata?.name as string | undefined,
    steps: entry.metadata?.steps as string[] | undefined,
    pipelineId: entry.metadata?.pipelineId as string | null | undefined,
    runId: entry.id,
    fallbackChain: chain,
  });
  // 重启被拒（如并发上限）或成功：都算“尝试过回退”，链终止收尾交给调用方
  return !relaunched.error;
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
