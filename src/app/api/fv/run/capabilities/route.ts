import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { getProviderProfiles } from '@/lib/fv/scheduler';

export async function GET() {
  ensureFvInit();
  return NextResponse.json(getProviderProfiles());
}
