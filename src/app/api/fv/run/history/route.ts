import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { stmts } from '@/lib/fv/db';

export async function GET(request: NextRequest) {
  ensureFvInit();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20') || 20;
  try {
    const rows = stmts.listHistory(limit);
    return NextResponse.json(rows.filter((r) => String(r.title).includes('一键匹配') || String(r.title).includes(':')));
  } catch {
    return NextResponse.json([]);
  }
}
