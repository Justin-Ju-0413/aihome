import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { getValues } from '@/lib/fv/settings';

export async function GET() {
  ensureFvInit();
  return NextResponse.json(getValues());
}
