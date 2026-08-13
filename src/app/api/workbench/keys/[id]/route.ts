import { NextResponse } from 'next/server';
import { updateKey, deleteKey } from '@/lib/workbench/crud';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const key = updateKey(Number(id), { label: body?.label, key: body?.key });
    if (!key) return NextResponse.json({ error: 'key 不存在' }, { status: 404 });
    return NextResponse.json({ key });
  } catch (error) {
    console.error('Failed to update key:', error);
    return NextResponse.json({ error: 'Failed to update key' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ ok: deleteKey(Number(id)) });
}
