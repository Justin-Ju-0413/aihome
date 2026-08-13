import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { validateSetting } from '@/lib/fv/settings';

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  ensureFvInit();
  const { key } = await params;
  const body = await request.json().catch(() => ({}));
  const { value } = body;
  if (value === undefined) return NextResponse.json({ error: 'value required' }, { status: 400 });
  return NextResponse.json(validateSetting(key, value));
}
