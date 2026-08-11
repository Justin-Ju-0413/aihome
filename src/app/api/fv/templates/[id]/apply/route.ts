import { NextRequest, NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { applyTemplate } from '@/lib/fv/templates';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const result = applyTemplate(id, body.variables || {});
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
