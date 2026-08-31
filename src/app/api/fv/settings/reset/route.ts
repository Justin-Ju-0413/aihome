import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { resetAll } from '@/lib/fv/settings';
import { emitEvent } from '@/lib/fv/events';

export async function POST() {
  ensureFvInit();
  resetAll();
  emitEvent({ type: 'settings:reset' });
  return NextResponse.json({ ok: true });
}
