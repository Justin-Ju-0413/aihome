import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as hermesAdapter from '@/lib/fv/hermes-adapter';

export async function GET(request: NextRequest) {
  ensureFvInit();
  if (!hermesAdapter.isAvailable()) return NextResponse.json([]);
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20') || 20;
  return NextResponse.json(hermesAdapter.getSessions(limit));
}
