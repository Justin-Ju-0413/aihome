import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { jsonError } from '@/lib/api-response';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  const detail = agentRunner.getAgentDetail(id);
  if (!detail) return jsonError('not found', 404, 'AGENT_NOT_FOUND');
  return NextResponse.json(detail);
}
