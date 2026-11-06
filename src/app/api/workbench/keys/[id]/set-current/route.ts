import { NextResponse } from 'next/server';
import { listKeys, setCurrentKey } from '@/lib/workbench/crud';
import { jsonError } from '@/lib/api-response';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = listKeys().find((k) => k.id === Number(id));
  if (!key) return jsonError('key 不存在', 404);
  setCurrentKey(key.siteId, Number(id));
  return NextResponse.json({ ok: true });
}
