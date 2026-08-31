import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { processRegistry } from '@/lib/fv/orchestrator';

export async function GET() {
  ensureFvInit();
  return NextResponse.json(processRegistry.listRunning());
}
