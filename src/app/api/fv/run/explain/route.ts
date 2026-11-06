import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { getScheduleExplanation } from '@/lib/fv/scheduler';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{ task?: string; provider?: string; model?: string; skill?: string }>(request);
    const { task, provider, model, skill } = body;
    if (!task) return jsonError('task required', 400);
    return NextResponse.json(getScheduleExplanation(task, { provider, model, skill }));
  } catch (err) {
    return handleRouteError(err, 'Failed to explain schedule');
  }
}
