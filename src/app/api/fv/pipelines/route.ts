import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { stmts } from '@/lib/fv/db';

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
    const body = await request.json();
    const { name, description, agents } = body;
    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return NextResponse.json({ error: 'agents required' }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const id = agentRunner.createPipeline({ name, description, agents });
    const pipeline = agentRunner.getPipeline(id);
    return NextResponse.json({ id, pipeline });
  } catch (err) {
    console.error('Failed to create pipeline:', err);
    return NextResponse.json({ error: 'Failed to create pipeline' }, { status: 500 });
  }
}
