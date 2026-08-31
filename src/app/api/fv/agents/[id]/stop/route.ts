import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  const ok = agentRunner.stopAgent(id);
  return NextResponse.json({ ok });
}
