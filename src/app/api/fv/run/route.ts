import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { launch } from '@/lib/fv/orchestrator';

/** 一键匹配执行 */
export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const { task, provider, model, target, cwd, skill } = body;
    if (!task) return NextResponse.json({ error: 'task required' }, { status: 400 });
    const result = launch({ task, provider, model, target, cwd, skill });
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to run task:', err);
    return NextResponse.json({ error: 'Failed to run task' }, { status: 500 });
  }
}
