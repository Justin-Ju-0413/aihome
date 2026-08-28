import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { stmts } from './db';
import { getValues } from './settings';
import { emitEvent } from './events';
import { parseStructuredOutput, createJsonLineParser, detectStepProgress } from './agent-output';
import { createSnapshot, generateDiff } from './agent-snapshots';
import { getAgentDetail, type AgentRow } from './agent-queries';
import { updatePipelineProgress } from './agent-pipeline-progress';

/** 对外门面：进程生命周期 + 全量 re-export（API 面不变）。 */

// ---- re-export 子模块（保持既有 import { ... } from './agent-runner' 有效） ----
export { parseStructuredOutput, createJsonLineParser, detectStepProgress, type StructuredOutput } from './agent-output';
export { createSnapshot, generateDiff, computeSimpleDiff, rollbackFile } from './agent-snapshots';
export { getAgentDetail, listAgents, listActiveAgents, getSteps, getLogs, getDiffs, listPipelines, getPipeline, type AgentRow } from './agent-queries';
export { createPipeline, startPipeline } from './agent-pipelines';
export { updatePipelineProgress } from './agent-pipeline-progress';

/** Agent 执行器（原 agent-runner.js 移植，ws 广播改为内部事件总线） */

export const activeProcesses = new Map<string, ChildProcess>();

/** 用户主动停止的 agent：close 晚到时不得把 stopped 覆盖为 completed/error */
const stopRequested = new Set<string>();

export function createAgent(input: {
  name: string;
  provider: string;
  description?: string;
  target?: string;
  cwd?: string;
  prompt?: string;
  steps?: string[];
  pipelineId?: string | null;
  pipelineOrder?: number;
  nextAgentId?: string | null;
}): string {
  const id = randomUUID();
  const totalSteps = input.steps?.length || 0;

  stmts.insertAgent({
    id, name: input.name, provider: input.provider,
    status: 'pending',
    description: input.description || '',
    target: input.target || '',
    cwd: input.cwd || process.cwd(),
    prompt: input.prompt || '',
    totalSteps,
    pipelineId: input.pipelineId || null,
    pipelineOrder: input.pipelineOrder || 0,
    nextAgentId: input.nextAgentId || null,
  });

  if (input.steps) {
    input.steps.forEach((s, i) => {
      stmts.insertStep({ agentId: id, stepNum: i + 1, name: s, status: 'pending' });
    });
  }

  stmts.insertHistory({
    type: 'agent', title: `${input.name} 已创建`,
    description: `Provider: ${input.provider}, Target: ${input.target || 'N/A'}`,
    agentId: id, filePath: '',
  });

  return id;
}

export function startAgent(agentId: string): number {
  const agent = stmts.getAgent(agentId) as AgentRow | undefined;
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  // 并发保护：同一 agent 已在运行时不重复 spawn（否则前一个进程失去引用成孤儿）
  if (activeProcesses.has(agentId)) {
    throw new Error(`Agent ${agentId} is already running`);
  }

  stmts.updateAgentStatus({
    id: agentId, status: 'running', progress: 0, currentStep: 0, finishedAt: null, tokenUsage: 0,
  });

  stmts.insertLog({ agentId, type: 'status', content: 'Agent started', structured: '{}' });
  stmts.insertHistory({
    type: 'agent', title: `${agent.name} 启动`, description: agent.description, agentId, filePath: '',
  });

  emitEvent({ type: 'agent:start', agentId, agent: getAgentDetail(agentId) });

  const vals = getValues();

  const filesToSnapshot = agent.target ? agent.target.split(',').map((f: string) => f.trim()).filter((f: string) => {
    try {
      return fs.existsSync(f);
    } catch {
      return false;
    }
  }) : [];
  if (vals['agent.snapshot_on_start'] !== 'false') {
    filesToSnapshot.forEach((fp) => createSnapshot(agentId, fp));
  }

  const cmd = agent.provider === 'claude'
    ? (vals['connection.claude_path'] || 'claude')
    : agent.provider === 'zcode'
      ? (vals['connection.zcode_path'] || 'zcode')
      : agent.provider === 'dsh'
        ? (vals['connection.dsh_path'] || 'dsh')
        : (vals['connection.codex_path'] || 'codex');
  const args = buildArgs(agent);

  const proc = spawn(cmd, args, {
    cwd: agent.cwd || process.cwd(),
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  activeProcesses.set(agentId, proc);

  let stepIndex = 0;
  let tokenCount = 0;
  const steps = stmts.getSteps(agentId);
  const totalSteps = steps.length || 1;

  // 流式行解析：chunk 可能切断 JSON 行，按换行重装完整行后再解析
  const structuredParser = createJsonLineParser((line) => {
    if (line.trim().startsWith('{')) {
      const parsed = parseStructuredOutput(line, agent.provider);
      if (parsed.tools.length > 0 || parsed.edits.length > 0) {
        stmts.insertLog({
          agentId, type: 'structured', content: JSON.stringify(parsed),
          structured: JSON.stringify(parsed),
        });
        emitEvent({ type: 'agent:structured', agentId, data: parsed });
      }
    }
    detectStepProgress(line, steps, stepIndex, agentId, (newIdx) => { stepIndex = newIdx; });
  });

  proc.stdout.on('data', (data: Buffer) => {
    const text = data.toString();
    stmts.insertLog({ agentId, type: 'stdout', content: text, structured: '{}' });

    structuredParser(text);
    tokenCount += Math.ceil(text.length / 4);

    const maxProgress = parseInt(vals['agent.max_running_progress'] || '95');
    const progress = Math.min(maxProgress, ((stepIndex + 0.5) / totalSteps) * 100);
    stmts.updateAgentStatus({
      id: agentId, status: 'running', progress, currentStep: stepIndex, finishedAt: null, tokenUsage: tokenCount,
    });

    emitEvent({
      type: 'agent:output', agentId, data: text, progress, currentStep: stepIndex,
    });
  });

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString();
    stmts.insertLog({ agentId, type: 'stderr', content: text, structured: '{}' });
    emitEvent({ type: 'agent:stderr', agentId, data: text });
  });

  proc.on('close', (code) => {
    activeProcesses.delete(agentId);
    // 用户主动停止：SIGTERM 已发、状态已置 stopped，close 晚到时保持 stopped
    if (stopRequested.has(agentId)) {
      stopRequested.delete(agentId);
      stmts.insertLog({ agentId, type: 'status', content: 'Agent stopped by user', structured: '{}' });
      stmts.insertHistory({
        type: 'agent', title: agent.name + ' 已停止',
        description: 'Stopped by user', agentId, filePath: '',
      });
      emitEvent({ type: 'agent:complete', agentId, status: 'stopped', agent: getAgentDetail(agentId) });
      if (agent.pipeline_id) updatePipelineProgress(agent.pipeline_id);
      return;
    }
    const finalStatus = code === 0 ? 'completed' : 'error';
    const allSteps = stmts.getSteps(agentId);

    allSteps.forEach((s, i) => {
      if (i <= stepIndex) stmts.updateStep({ agentId, stepNum: Number(s.step_num), status: 'done' });
    });

    stmts.updateAgentStatus({
      id: agentId, status: finalStatus, progress: 100,
      currentStep: allSteps.length, finishedAt: new Date().toISOString(), tokenUsage: tokenCount,
    });

    filesToSnapshot.forEach((fp) => generateDiff(agentId, fp));

    stmts.insertLog({ agentId, type: 'status', content: `Agent ${finalStatus} with code ${code}`, structured: '{}' });
    stmts.insertHistory({
      type: 'agent',
      title: `${agent.name} ${finalStatus === 'completed' ? '完成' : '出错'}`,
      description: `Exit code: ${code}, Tokens: ~${tokenCount}`,
      agentId, filePath: '',
    });

    emitEvent({ type: 'agent:complete', agentId, status: finalStatus, agent: getAgentDetail(agentId) });

    if (finalStatus === 'completed' && agent.next_agent_id) {
      const stepDelay = parseInt(vals['agent.pipeline_step_delay'] || '500');
      setTimeout(() => {
        try {
          startAgent(agent.next_agent_id!);
          emitEvent({ type: 'pipeline:advance', fromAgentId: agentId, toAgentId: agent.next_agent_id });
        } catch (err) {
          emitEvent({ type: 'pipeline:error', error: (err as Error).message });
        }
      }, stepDelay);
    }

    if (agent.pipeline_id) {
      updatePipelineProgress(agent.pipeline_id);
    }
  });

  proc.on('error', (err) => {
    activeProcesses.delete(agentId);
    stmts.updateAgentStatus({
      id: agentId, status: 'error', progress: 0, currentStep: 0,
      finishedAt: new Date().toISOString(), tokenUsage: 0,
    });
    stmts.insertLog({ agentId, type: 'error', content: err.message, structured: '{}' });
    emitEvent({ type: 'agent:error', agentId, error: err.message });
  });

  return proc.pid ?? -1;
}

export function stopAgent(agentId: string): boolean {
  const proc = activeProcesses.get(agentId);
  if (proc) {
    proc.kill('SIGTERM');
    stopRequested.add(agentId);
    activeProcesses.delete(agentId);
    stmts.updateAgentStatus({
      id: agentId, status: 'stopped', progress: 0, currentStep: 0,
      finishedAt: new Date().toISOString(), tokenUsage: 0,
    });
    emitEvent({ type: 'agent:stopped', agentId });
    return true;
  }
  return false;
}

function buildArgs(agent: AgentRow): string[] {
  if (agent.provider === 'claude') {
    const args = ['-p', '--verbose', '--output-format', 'stream-json'];
    if (agent.prompt) args.push(agent.prompt);
    if (agent.target) args.push('--add-dir', agent.target);
    return args;
  }
  if (agent.provider === 'zcode') {
    // ZCode CLI 兼容 Claude Code 风格参数；实际路径可在设置中覆盖。
    const args = ['-p', '--verbose', '--output-format', 'stream-json'];
    if (agent.prompt) args.push(agent.prompt);
    if (agent.target) args.push('--add-dir', agent.target);
    return args;
  }
  if (agent.provider === 'dsh') {
    // DSH 当前以通用 run 子命令启动，路径/参数可在后续按真实 CLI 调整。
    const args = ['run'];
    if (agent.prompt) args.push(agent.prompt);
    if (agent.target) args.push('--target', agent.target);
    return args;
  }
  const args = ['exec'];
  if (agent.prompt) args.push(agent.prompt);
  args.push('--skip-git-repo-check', '--full-auto');
  return args;
}
