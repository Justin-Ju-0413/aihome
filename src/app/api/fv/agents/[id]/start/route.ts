import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { jsonError, handleRouteError } from '@/lib/api-response';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  try {
    const pid = agentRunner.startAgent(id);
    return NextResponse.json({ pid });
  } catch (err) {
    // 并发启动同一 agent 属业务冲突，映射为 409（比 500 语义更准确）
    if (err instanceof Error && /already running/.test(err.message)) {
      return jsonError(err.message, 409, 'AGENT_ALREADY_RUNNING');
    }
    return handleRouteError(err, 'Failed to start agent', 500);
  }
}
