import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { getScheduleExplanation } from '@/lib/fv/scheduler';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const { task, provider, model, skill } = body;
    if (!task) return NextResponse.json({ error: 'task required' }, { status: 400 });
    return NextResponse.json(getScheduleExplanation(task, { provider, model, skill }));
  } catch (err) {
    console.error('Failed to explain schedule:', err);
    return NextResponse.json({ error: 'Failed to explain schedule' }, { status: 500 });
  }
}
