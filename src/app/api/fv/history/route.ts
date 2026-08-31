import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { stmts } from '@/lib/fv/db';
import { emitEvent } from '@/lib/fv/events';

export async function GET(request: NextRequest) {
  ensureFvInit();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100') || 100;
  const type = searchParams.get('type');
  const rows = type ? stmts.listHistoryByType(type, limit) : stmts.listHistory(limit);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const { type, title, description, agentId, filePath } = body;
    if (!type || !title) return NextResponse.json({ error: 'type and title required' }, { status: 400 });
    stmts.insertHistory({
      type, title, description: description || '', agentId: agentId || null, filePath: filePath || '',
    });
    emitEvent({ type: 'history:new', entry: { type, title, description } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to insert history:', err);
    return NextResponse.json({ error: 'Failed to insert history' }, { status: 500 });
  }
}
