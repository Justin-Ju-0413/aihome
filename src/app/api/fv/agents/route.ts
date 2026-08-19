import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { stmts } from '@/lib/fv/db';
import { readJsonBody, jsonError, handleRouteError } from '@/lib/api-response';

/** Agent 列表（带 steps；运行中的 agent 附带实时活动/日志供轮询展示） */
export async function GET() {
  ensureFvInit();
  const agents = agentRunner.listAgents();
  const detailed = agents.map((a) => {
    const steps = stmts.getSteps(String(a.id));
    const active = a.status === 'running' || a.status === 'pending';
    const logs = active ? stmts.getLogs(String(a.id)).slice(0, 30) : [];
    const extra = active ? agentRunner.getAgentDetail(String(a.id)) : null;
    return {
      ...a, steps, logs,
      ...(extra
        ? {
            activities: extra.activities,
            targetFiles: extra.targetFiles,
            operationStats: extra.operationStats,
            diffs: extra.diffs,
            snapshots: extra.snapshots,
          }
        : {}),
    };
  });
  return NextResponse.json(detailed);
}

/** 手动创建 Agent（provider 限 claude/codex/zcode/dsh，hermes 走一键匹配） */
export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{
      name?: string; provider?: string; description?: string; target?: string;
      cwd?: string; prompt?: string; steps?: string[];
      pipelineId?: string | null; pipelineOrder?: number; nextAgentId?: string | null;
    }>(request);
    const { name, provider, description, target, cwd, prompt, steps, pipelineId, pipelineOrder, nextAgentId } = body;
    if (!name) return jsonError('name required', 400, 'NAME_REQUIRED');
    if (!provider || !['claude', 'codex', 'zcode', 'dsh'].includes(provider)) {
      return jsonError('provider must be claude, codex, zcode or dsh', 400, 'INVALID_PROVIDER');
    }
    const id = agentRunner.createAgent({
      name, provider, description, target, cwd, prompt,
      steps: Array.isArray(steps) ? steps : undefined,
      pipelineId, pipelineOrder, nextAgentId,
    });
    return NextResponse.json({ id, agent: agentRunner.getAgentDetail(id) });
  } catch (err) {
    return handleRouteError(err, 'Failed to create agent');
  }
}
