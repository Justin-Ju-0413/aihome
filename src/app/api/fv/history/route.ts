import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { stmts } from '@/lib/fv/db';
import { emitEvent } from '@/lib/fv/events';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

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
    const body = await readJsonBody<{ type?: string; title?: string; description?: string; agentId?: string; filePath?: string }>(request);
    const { type, title, description, agentId, filePath } = body;
    if (!type || !title) return jsonError('type and title required', 400);
    stmts.insertHistory({
      type, title, description: description || '', agentId: agentId || null, filePath: filePath || '',
    });
    emitEvent({ type: 'history:new', entry: { type, title, description } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, 'Failed to insert history');
  }
}
