import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { watchFile } from '@/lib/fv/file-scanner';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{ path?: string; agentIds?: unknown }>(request);
    const { path: filePath, agentIds } = body;
    if (!filePath) return jsonError('path required', 400);
    watchFile(filePath, Array.isArray(agentIds) ? agentIds : []);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, 'Failed to watch file');
  }
}
