import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { watchFile } from '@/lib/fv/file-scanner';

export async function POST(request: NextRequest) {
  ensureFvInit();
  try {
    const body = await request.json();
    const { path: filePath, agentIds } = body;
    if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 });
    watchFile(filePath, Array.isArray(agentIds) ? agentIds : []);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to watch file:', err);
    return NextResponse.json({ error: 'Failed to watch file' }, { status: 500 });
  }
}
