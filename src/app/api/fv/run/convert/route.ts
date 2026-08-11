import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { convert } from '@/lib/fv/prompt-converter';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const { task, provider, target, skill } = body;
    if (!task || !provider) return NextResponse.json({ error: 'task and provider required' }, { status: 400 });
    return NextResponse.json(convert(task, provider, { target, skill }));
  } catch (err) {
    console.error('Failed to convert prompt:', err);
    return NextResponse.json({ error: 'Failed to convert prompt' }, { status: 500 });
  }
}
