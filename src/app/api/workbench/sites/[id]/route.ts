import { NextResponse } from 'next/server';
import { updateSite, deleteSite } from '@/lib/workbench/crud';
import type { SiteInput } from '@/lib/workbench/types';
import { handleRouteError, jsonError } from '@/lib/api-response';

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
    if (!site) return jsonError('site 不存在', 404);
    return NextResponse.json({ site });
  } catch (err) {
    return handleRouteError(err, 'Failed to update site', 400);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ ok: deleteSite(id) });
}
