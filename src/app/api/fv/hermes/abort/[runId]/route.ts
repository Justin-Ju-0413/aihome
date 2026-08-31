import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { abort } from '@/lib/fv/orchestrator';

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  ensureFvInit();
  const { runId } = await params;
  const ok = abort(runId);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
