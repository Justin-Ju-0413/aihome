import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { stmts } from '@/lib/fv/db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  const p = agentRunner.getPipeline(id);
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const agentIds = JSON.parse(String(p.agent_ids)) as string[];
  const agents = agentIds.map((aid) => stmts.getAgent(aid)).filter(Boolean);
  return NextResponse.json({ ...p, agents });
}
