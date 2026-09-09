import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { jsonError } from '@/lib/api-response';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  try {
    agentRunner.startPipeline(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // startPipeline 抛的是面向用户的业务错误(如 pipeline 不存在),保持透传
    return jsonError(err instanceof Error ? err.message : 'start failed', 500);
  }
}
