import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { abort } from '@/lib/fv/orchestrator';

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  ensureFvInit();
  const { runId } = await params;
  const ok = abort(runId);
  return NextResponse.json({ ok });
}
