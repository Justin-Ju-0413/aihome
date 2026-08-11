import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { importSettings } from '@/lib/fv/settings';
import { emitEvent } from '@/lib/fv/events';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const result = importSettings(body);
    if (typeof result.imported === 'number' && result.imported > 0) {
      emitEvent({ type: 'settings:reset' });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to import settings:', err);
    return NextResponse.json({ error: 'Failed to import settings' }, { status: 500 });
  }
}
