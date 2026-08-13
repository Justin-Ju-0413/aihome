import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { getSetting, setSetting, validateSetting } from '@/lib/fv/settings';
import { emitEvent } from '@/lib/fv/events';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  ensureFvInit();
  const { key } = await params;
  const setting = getSetting(key);
  if (!setting) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(setting);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  ensureFvInit();
  const { key } = await params;
  const body = await request.json().catch(() => ({}));
  const { value } = body;
  if (value === undefined) return NextResponse.json({ error: 'value required' }, { status: 400 });
  const validation = validateSetting(key, value);
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
  const result = setSetting(key, String(value));
  emitEvent({ type: 'settings:changed', key: result.key, value: result.value });
  return NextResponse.json(result);
}
