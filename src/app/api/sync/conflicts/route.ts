import { NextResponse } from 'next/server';
import { buildState } from '@/lib/sync/engine';

export async function GET() {
  try {
    const state = await buildState();
    return NextResponse.json(state.conflicts);
  } catch (error) {
    console.error('Sync conflicts error:', error);
    return NextResponse.json({ error: 'Failed to load conflicts' }, { status: 500 });
  }
}
