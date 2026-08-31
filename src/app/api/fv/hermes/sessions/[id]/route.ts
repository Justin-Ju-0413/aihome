import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as hermesAdapter from '@/lib/fv/hermes-adapter';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  if (!hermesAdapter.isAvailable()) return NextResponse.json({ error: 'hermes not available' }, { status: 404 });
  const detail = hermesAdapter.getSessionDetail(id);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(detail);
}
