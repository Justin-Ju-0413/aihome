import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as hermesAdapter from '@/lib/fv/hermes-adapter';

export async function GET() {
  ensureFvInit();
  if (!hermesAdapter.isAvailable()) return NextResponse.json({ available: false });
  return NextResponse.json({ available: true, ...hermesAdapter.getSessionStats() });
}
