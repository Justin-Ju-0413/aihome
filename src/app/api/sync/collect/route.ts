import { NextRequest, NextResponse } from 'next/server';
import { collect } from '@/lib/sync/engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const only = Array.isArray(body.only) ? body.only.filter((n: unknown) => typeof n === 'string') : undefined;
    const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
    const result = await collect(only, dryRun);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to collect' },
      { status: 400 }
    );
  }
}
