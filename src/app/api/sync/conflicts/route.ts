import { NextResponse } from 'next/server';
import { buildState } from '@/lib/sync/engine';
import { handleRouteError } from '@/lib/api-response';

export async function GET() {
  try {
    const state = await buildState();
    return NextResponse.json(state.conflicts);
  } catch (err) {
    return handleRouteError(err, 'Failed to load conflicts');
  }
}
