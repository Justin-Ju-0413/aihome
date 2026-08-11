import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { getRunOutput } from '@/lib/fv/orchestrator';

/** run 实时输出轮询（替代 WS 流式推送） */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = parseInt(searchParams.get('cursor') || '0') || 0;
  return NextResponse.json(getRunOutput(id, cursor));
}
