import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { exportSettings } from '@/lib/fv/settings';

export async function GET() {
  ensureFvInit();
  return NextResponse.json(exportSettings());
}
