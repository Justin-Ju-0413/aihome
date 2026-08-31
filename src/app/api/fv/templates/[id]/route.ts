import { NextResponse } from 'next/server';
import { ensureFvInit } from '@/lib/fv/init';
import { getTemplate, deleteTemplate } from '@/lib/fv/templates';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  const tpl = getTemplate(id);
  if (!tpl) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(tpl);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureFvInit();
  const { id } = await params;
  deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
