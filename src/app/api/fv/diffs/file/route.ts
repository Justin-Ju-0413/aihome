import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { stmts } from '@/lib/fv/db';

/** 按文件路径查变更记录（路径含斜杠，用 query 参数而非动态段） */
export async function GET(request: NextRequest) {
  ensureFvInit();
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 });
  return NextResponse.json(stmts.getDiffsByFile(filePath));
}
