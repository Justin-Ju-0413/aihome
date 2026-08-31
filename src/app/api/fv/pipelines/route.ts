import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { stmts } from '@/lib/fv/db';
import { readJsonBody, jsonError, handleRouteError } from '@/lib/api-response';

export async function GET() {
  ensureFvInit();
  const pipelines = agentRunner.listPipelines();
  const detailed = pipelines.map((p) => {
    const agentIds = JSON.parse(String(p.agent_ids)) as string[];
    const agents = agentIds
      .map((id) => {
        const a = stmts.getAgent(id);
        return a ? { id: a.id, name: a.name, status: a.status, progress: a.progress, provider: a.provider } : null;
      })
      .filter(Boolean);
    return { ...p, agents };
  });
  return NextResponse.json(detailed);
}

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{ name?: string; description?: string; agents?: unknown }>(request);
    const { name, description, agents } = body;
    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return jsonError('agents required', 400, 'AGENTS_REQUIRED');
    }
    if (!name) return jsonError('name required', 400, 'NAME_REQUIRED');
    const id = agentRunner.createPipeline({ name, description, agents });
    const pipeline = agentRunner.getPipeline(id);
    return NextResponse.json({ id, pipeline });
  } catch (err) {
    return handleRouteError(err, 'Failed to create pipeline');
  }
}
