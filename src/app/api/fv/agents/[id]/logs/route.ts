import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  return NextResponse.json(agentRunner.getLogs(id));
}
