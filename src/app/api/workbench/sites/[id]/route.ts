import { NextResponse } from 'next/server';
import { updateSite, deleteSite } from '@/lib/workbench/crud';
import type { SiteInput } from '@/lib/workbench/types';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '无效的 JSON' }, { status: 400 });
  }
  try {
    const site = updateSite(id, body as unknown as Partial<SiteInput>);
    if (!site) return NextResponse.json({ error: 'site 不存在' }, { status: 404 });
    return NextResponse.json({ site });
  } catch (error) {
    console.error('Failed to update site:', error);
    return NextResponse.json({ error: 'Failed to update site' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ ok: deleteSite(id) });
}
