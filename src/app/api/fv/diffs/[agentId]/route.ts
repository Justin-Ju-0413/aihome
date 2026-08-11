import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  ensureFvInit();
  const { agentId } = await params;
  return NextResponse.json(agentRunner.getDiffs(agentId));
}
