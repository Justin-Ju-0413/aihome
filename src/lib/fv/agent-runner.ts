import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { stmts, type Row } from './db';
import { getValues } from './settings';
import { emitEvent } from './events';

/** Agent 执行器（原 agent-runner.js 移植，ws 广播改为内部事件总线） */

export const activeProcesses = new Map<string, ChildProcess>();

export interface AgentRow extends Row {
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
}

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

  proc.stdout.on('data', (data: Buffer) => {
    const text = data.toString();
    stmts.insertLog({ agentId, type: 'stdout', content: text, structured: '{}' });

    const parsed = parseStructuredOutput(text, agent.provider);
    if (parsed.tools.length > 0 || parsed.edits.length > 0) {
      stmts.insertLog({
        agentId, type: 'structured', content: JSON.stringify(parsed),
        structured: JSON.stringify(parsed),
      });
      emitEvent({ type: 'agent:structured', agentId, data: parsed });
    }
    tokenCount += Math.ceil(text.length / 4);

    const maxProgress = parseInt(vals['agent.max_running_progress'] || '95');
    const progress = Math.min(maxProgress, ((stepIndex + 0.5) / totalSteps) * 100);
    stmts.updateAgentStatus({
      id: agentId, status: 'running', progress, currentStep: stepIndex, finishedAt: null, tokenUsage: tokenCount,
    });

    emitEvent({
      type: 'agent:output', agentId, data: text, progress, currentStep: stepIndex,
    });

    detectStepProgress(text, steps, stepIndex, agentId, (newIdx) => { stepIndex = newIdx; });
  });

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString();
    stmts.insertLog({ agentId, type: 'stderr', content: text, structured: '{}' });
    emitEvent({ type: 'agent:stderr', agentId, data: text });
  });

  proc.on('close', (code) => {
    activeProcesses.delete(agentId);
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
  } else {
    const args = ['exec'];
    if (agent.prompt) args.push(agent.prompt);
    args.push('--skip-git-repo-check', '--full-auto');
    return args;
  }
}

function detectStepProgress(
  text: string,
  steps: Row[],
  currentIdx: number,
  agentId: string,
  onStepAdvance: (idx: number) => void
): void {
  if (!steps || currentIdx >= steps.length) return;
  const keywords = ['edit', 'write', 'create', 'refactor', 'test', 'lint', 'done', 'complete', 'fix', 'update', 'analyz', 'generat', 'modif'];
  const lower = text.toLowerCase();
  if (keywords.some((k) => lower.includes(k))) {
    const nextIdx = Math.min(currentIdx + 1, steps.length - 1);
    if (nextIdx > currentIdx) {
      stmts.updateStep({ agentId, stepNum: Number(steps[currentIdx].step_num), status: 'done' });
      if (nextIdx < steps.length) {
        stmts.updateStep({ agentId, stepNum: Number(steps[nextIdx].step_num), status: 'active' });
      }
      onStepAdvance(nextIdx);
      emitEvent({ type: 'agent:step', agentId, stepNum: nextIdx, stepName: steps[nextIdx]?.name });
    }
  }
}

export function parseStructuredOutput(text: string, provider: string): { tools: Array<{ name: string; input: Record<string, unknown> }>; edits: Array<{ file: string; action: string }>; messages: string[] } {
  const result: { tools: Array<{ name: string; input: Record<string, unknown> }>; edits: Array<{ file: string; action: string }>; messages: string[] } = { tools: [], edits: [], messages: [] };
  if (provider === 'claude') {
    const lines = text.split('\n').filter((l) => l.trim().startsWith('{'));
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'assistant' && obj.message?.content) {
          const content = Array.isArray(obj.message.content) ? obj.message.content : [obj.message.content];
          for (const c of content) {
            if (c.type === 'tool_use') {
              result.tools.push({ name: c.name, input: c.input ?? {} });
              if (c.name === 'Edit' || c.name === 'Write') {
                result.edits.push({ file: c.input?.file_path || c.input?.path || '', action: c.name });
              }
            }
            if (c.type === 'text') result.messages.push(c.text?.substring(0, 200));
          }
        }
      } catch {
        // 跳过非 JSON 行
      }
    }
  } else {
    if (text.includes('edit') || text.includes('write') || text.includes('modify')) {
      result.edits.push({ action: 'file_modification', file: '' });
    }
  }
  return result;
}

export function createSnapshot(agentId: string, filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    stmts.insertSnapshot({ agentId, filePath, contentHash: hash, content });
    return hash;
  } catch {
    return null;
  }
}

export function generateDiff(agentId: string, filePath: string): string | null {
  try {
    const snapshots = stmts.getSnapshotsByAgent(agentId);
    const fileSnapshots = snapshots.filter((s) => s.file_path === filePath);
    if (fileSnapshots.length < 1) return null;

    const original = String(fileSnapshots[fileSnapshots.length - 1].content);
    const current = fs.readFileSync(filePath, 'utf-8');
    if (original === current) return null;

    const diff = computeSimpleDiff(original, current, filePath);
    const snapshotId = Number(fileSnapshots[fileSnapshots.length - 1].id);
    stmts.insertDiff({ agentId, filePath, diffContent: diff, snapshotId });
    return diff;
  } catch {
    return null;
  }
}

export function computeSimpleDiff(oldText: string, newText: string, filePath: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = i < oldLines.length ? oldLines[i] : null;
    const n = i < newLines.length ? newLines[i] : null;
    if (o === n) {
      lines.push(` ${o}`);
    } else {
      if (o !== null) lines.push(`-${o}`);
      if (n !== null) lines.push(`+${n}`);
    }
  }
  return lines.join('\n');
}

export function rollbackFile(filePath: string): boolean {
  const snap = stmts.getLatestSnapshot(filePath);
  if (!snap) return false;
  try {
    fs.writeFileSync(filePath, String(snap.content), 'utf-8');
    stmts.insertHistory({
      type: 'edit', title: `回滚 ${filePath}`,
      description: `Restored from snapshot #${snap.id}`,
      agentId: null, filePath,
    });
    return true;
  } catch {
    return false;
  }
}

export function createPipeline(input: { name: string; description?: string; agents: Array<Record<string, unknown>> }): string {
  const pipelineId = randomUUID();
  const agentIds: string[] = [];

  for (let i = 0; i < input.agents.length; i++) {
    const cfg = input.agents[i] as {
      name?: string; provider?: string; description?: string; target?: string;
      cwd?: string; prompt?: string; steps?: string[];
    };
    const aid = createAgent({
      name: cfg.name || `step-${i + 1}`,
      provider: cfg.provider || 'claude',
      description: cfg.description,
      target: cfg.target,
      cwd: cfg.cwd,
      prompt: cfg.prompt,
      steps: cfg.steps,
      pipelineId,
      pipelineOrder: i,
      nextAgentId: null,
    });
    agentIds.push(aid);
  }

  for (let i = 0; i < agentIds.length - 1; i++) {
    stmts.updateAgentNext({ id: agentIds[i], nextAgentId: agentIds[i + 1] });
  }

  stmts.insertPipeline({
    id: pipelineId, name: input.name, description: input.description || '',
    status: 'pending', agentIds: JSON.stringify(agentIds),
  });

  return pipelineId;
}

export function startPipeline(pipelineId: string): string {
  const pipeline = stmts.getPipeline(pipelineId);
  if (!pipeline) throw new Error('Pipeline not found');
  const agentIds = JSON.parse(String(pipeline.agent_ids)) as string[];
  if (agentIds.length === 0) throw new Error('Pipeline has no agents');

  stmts.updatePipelineStatus({ id: pipelineId, status: 'running', currentIndex: 0, finishedAt: null });
  startAgent(agentIds[0]);
  return pipelineId;
}

function updatePipelineProgress(pipelineId: string): void {
  const pipeline = stmts.getPipeline(pipelineId);
  if (!pipeline) return;
  const agentIds = JSON.parse(String(pipeline.agent_ids)) as string[];
  const agents = agentIds.map((id) => stmts.getAgent(id));
  const allCompleted = agents.every((a) => a?.status === 'completed');
  const anyError = agents.some((a) => a?.status === 'error');
  const currentIdx = agents.findIndex((a) => a?.status === 'running');

  if (allCompleted) {
    stmts.updatePipelineStatus({ id: pipelineId, status: 'completed', currentIndex: agentIds.length - 1, finishedAt: new Date().toISOString() });
    emitEvent({ type: 'pipeline:completed', pipelineId });
  } else if (anyError) {
    stmts.updatePipelineStatus({ id: pipelineId, status: 'error', currentIndex: Math.max(0, currentIdx), finishedAt: new Date().toISOString() });
    emitEvent({ type: 'pipeline:error', pipelineId });
  } else {
    stmts.updatePipelineStatus({ id: pipelineId, status: 'running', currentIndex: Math.max(0, currentIdx), finishedAt: null });
  }
}

export function getAgentDetail(agentId: string): Record<string, unknown> | null {
  const agent = stmts.getAgent(agentId) as AgentRow | undefined;
  if (!agent) return null;
  const steps = stmts.getSteps(agentId);
  const logs = stmts.getLogs(agentId);
  const diffs = stmts.getDiffsByAgent(agentId);
  const snapshots = stmts.getSnapshotsByAgent(agentId);

  const activities: Array<{ type: string; file: string; tool: string; time: string }> = [];
  for (const log of logs) {
    if (log.type === 'structured') {
      try {
        const parsed = JSON.parse(String(log.content));
        if (parsed.edits?.length) {
          for (const e of parsed.edits) {
            activities.push({
              type: e.action === 'Edit' ? 'edit' : e.action === 'Write' ? 'create' : 'modify',
              file: e.file || '',
              tool: e.action,
              time: String(log.created_at),
            });
          }
        }
        if (parsed.tools?.length) {
          for (const t of parsed.tools) {
            if (t.name !== 'Edit' && t.name !== 'Write') {
              activities.push({
                type: 'tool',
                tool: t.name,
                file: t.input?.file_path || t.input?.path || '',
                time: String(log.created_at),
              });
            }
          }
        }
      } catch {
        // 忽略解析失败
      }
    }
    if (log.type === 'stdout') {
      try {
        const lines = String(log.content).split('\n').filter((l) => l.trim().startsWith('{'));
        for (const line of lines) {
          const obj = JSON.parse(line);
          if (obj.type === 'assistant' && obj.message?.content) {
            const content = Array.isArray(obj.message.content) ? obj.message.content : [obj.message.content];
            for (const c of content) {
              if (c.type === 'tool_use') {
                const opType = c.name === 'Read' ? 'read' : c.name === 'Edit' ? 'edit' : c.name === 'Write' ? 'create' : c.name === 'Bash' ? 'execute' : 'tool';
                activities.push({
                  type: opType,
                  tool: c.name,
                  file: c.input?.file_path || c.input?.path || '',
                  time: String(log.created_at),
                });
              }
            }
          }
        }
      } catch {
        // 忽略解析失败
      }
    }
  }

  const targetFiles = agent.target ? agent.target.split(',').map((f) => f.trim()).filter(Boolean) : [];
  const uniqueFiles = [...new Set([...targetFiles, ...activities.map((a) => a.file).filter(Boolean)])];

  return {
    ...agent, steps, logs: logs.slice(-50), diffs, snapshots: snapshots.length,
    activities: activities.slice(-30),
    targetFiles: uniqueFiles,
    operationStats: {
      read: activities.filter((a) => a.type === 'read').length,
      edit: activities.filter((a) => a.type === 'edit').length,
      create: activities.filter((a) => a.type === 'create').length,
      execute: activities.filter((a) => a.type === 'execute').length,
      tool: activities.filter((a) => a.type === 'tool').length,
    },
  };
}

export function listAgents(): Row[] {
  return stmts.listAgents();
}

export function listActiveAgents(): Row[] {
  return stmts.listActiveAgents();
}

export function getSteps(id: string): Row[] {
  return stmts.getSteps(id);
}

export function getLogs(id: string): Row[] {
  return stmts.getLogs(id);
}

export function getDiffs(id: string): Row[] {
  return stmts.getDiffsByAgent(id);
}

export function listPipelines(): Row[] {
  return stmts.listPipelines();
}

export function getPipeline(id: string): Row | undefined {
  return stmts.getPipeline(id);
}
