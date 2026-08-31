import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import * as hermesAdapter from '@/lib/fv/hermes-adapter';

export async function GET() {
  ensureFvInit();
  return NextResponse.json(hermesAdapter.getMemories());
}
