import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { launch } from '@/lib/fv/orchestrator';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

/** 一键匹配执行 */
export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{ task?: string; provider?: string; model?: string; target?: string; cwd?: string; skill?: string }>(request);
    const { task, provider, model, target, cwd, skill } = body;
    if (!task) return jsonError('task required', 400);
    const result = launch({ task, provider, model, target, cwd, skill });
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, 'Failed to run task');
  }
}
