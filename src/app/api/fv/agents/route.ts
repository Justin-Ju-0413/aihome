import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { stmts } from '@/lib/fv/db';

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

/** 手动创建 Agent（provider 限 claude/codex，hermes 走一键匹配） */
export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const { name, provider, description, target, cwd, prompt, steps, pipelineId, pipelineOrder, nextAgentId } = body;
    if (!['claude', 'codex'].includes(provider)) {
      return NextResponse.json({ error: 'provider must be claude or codex' }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const id = agentRunner.createAgent({
      name, provider, description, target, cwd, prompt,
      steps: Array.isArray(steps) ? steps : undefined,
      pipelineId, pipelineOrder, nextAgentId,
    });
    return NextResponse.json({ id, agent: agentRunner.getAgentDetail(id) });
  } catch (err) {
    console.error('Failed to create agent:', err);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}
