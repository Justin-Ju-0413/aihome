import { randomUUID } from 'crypto';
import { stmts } from './db';
import { createAgent, startAgent } from './agent-runner';

/**
 * 流水线装配与启动。从 agent-runner 拆出，保持行为不变。
 * 依赖 agent-runner 的 createAgent/startAgent（runner 不反向 import 本模块，无环）。
 */

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
