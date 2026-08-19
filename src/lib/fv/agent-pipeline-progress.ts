import { stmts } from './db';
import { emitEvent } from './events';

/**
 * 流水线进度规约（无 runner 依赖，供 runner 与 pipelines 复用，避免循环导入）。
 * 从 agent-runner 拆出，保持行为不变。
 */

export function updatePipelineProgress(pipelineId: string): void {
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
