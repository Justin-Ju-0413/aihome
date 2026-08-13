import { NextResponse } from 'next/server';
import { listKeys, setCurrentKey } from '@/lib/workbench/crud';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = listKeys().find((k) => k.id === Number(id));
  if (!key) return NextResponse.json({ error: 'key 不存在' }, { status: 404 });
  setCurrentKey(key.siteId, Number(id));
  return NextResponse.json({ ok: true });
}
