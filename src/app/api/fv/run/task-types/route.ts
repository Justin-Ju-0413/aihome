import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { getTaskTypes } from '@/lib/fv/prompt-converter';

export async function GET() {
  ensureFvInit();
  return NextResponse.json(getTaskTypes());
}
