import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { importSettings } from '@/lib/fv/settings';
import { emitEvent } from '@/lib/fv/events';
import { handleRouteError, readJsonBody } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const result = importSettings(body);
    if (typeof result.imported === 'number' && result.imported > 0) {
      emitEvent({ type: 'settings:reset' });
    }
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, 'Failed to import settings');
  }
}
