import { NextRequest, NextResponse } from 'next/server';
import { push } from '@/lib/sync/engine';
import { handleRouteError } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const only = Array.isArray(body.only) ? body.only.filter((n: unknown) => typeof n === 'string') : undefined;
    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
    const result = await push(only, dryRun);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, 'Failed to push', 400);
  }
}
