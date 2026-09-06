import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { launch } from '@/lib/fv/orchestrator';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{ prompt?: string; model?: string; skill?: string; cwd?: string }>(request);
    const { prompt, model, skill, cwd } = body;
    if (!prompt) return jsonError('prompt required', 400);
    const result = launch({ task: prompt, provider: 'hermes', model, skill, cwd });
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, 'Failed to launch hermes');
  }
}
