import { NextResponse } from 'next/server';
import { updateKey, deleteKey } from '@/lib/workbench/crud';
import { handleRouteError, jsonError } from '@/lib/api-response';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const key = updateKey(Number(id), { label: body?.label, key: body?.key });
    if (!key) return jsonError('key 不存在', 404);
    return NextResponse.json({ key });
  } catch (err) {
    return handleRouteError(err, 'Failed to update key', 400);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ ok: deleteKey(Number(id)) });
}
