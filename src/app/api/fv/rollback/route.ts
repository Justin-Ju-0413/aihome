import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { emitEvent } from '@/lib/fv/events';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const { filePath } = body;
    if (!filePath) return NextResponse.json({ error: 'filePath required' }, { status: 400 });
    const ok = agentRunner.rollbackFile(filePath);
    if (ok) emitEvent({ type: 'file:change', event: 'change', path: filePath, timestamp: Date.now() });
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('Failed to rollback file:', err);
    return NextResponse.json({ error: 'Failed to rollback file' }, { status: 500 });
  }
}
