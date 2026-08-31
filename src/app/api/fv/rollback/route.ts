import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as agentRunner from '@/lib/fv/agent-runner';
import { emitEvent } from '@/lib/fv/events';
import { readJsonBody, jsonError, handleRouteError } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{ filePath?: string }>(request);
    const { filePath } = body;
    if (!filePath) return jsonError('filePath required', 400, 'FILE_PATH_REQUIRED');
    const ok = agentRunner.rollbackFile(filePath);
    if (ok) emitEvent({ type: 'file:change', event: 'change', path: filePath, timestamp: Date.now() });
    return NextResponse.json({ ok });
  } catch (err) {
    return handleRouteError(err, 'Failed to rollback file');
  }
}
