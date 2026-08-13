import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { launch } from '@/lib/fv/orchestrator';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const { prompt, model, skill, cwd } = body;
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    const result = launch({ task: prompt, provider: 'hermes', model, skill, cwd });
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to launch hermes:', err);
    return NextResponse.json({ error: 'Failed to launch hermes' }, { status: 500 });
  }
}
