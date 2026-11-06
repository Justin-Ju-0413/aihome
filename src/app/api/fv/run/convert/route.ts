import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { convert } from '@/lib/fv/prompt-converter';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<{ task?: string; provider?: string; target?: string; skill?: string }>(request);
    const { task, provider, target, skill } = body;
    if (!task || !provider) return jsonError('task and provider required', 400);
    return NextResponse.json(convert(task, provider, { target, skill }));
  } catch (err) {
    return handleRouteError(err, 'Failed to convert prompt');
  }
}
