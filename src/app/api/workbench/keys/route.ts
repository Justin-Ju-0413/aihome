import { NextResponse } from 'next/server';
import { listKeys, saveKey } from '@/lib/workbench/crud';
import type { Provider } from '@/lib/workbench/types';
import { handleRouteError, jsonError } from '@/lib/api-response';

export async function GET(req: Request) {
  const siteId = new URL(req.url).searchParams.get('siteId') ?? undefined;
  return NextResponse.json({ keys: listKeys(siteId) });
}

export async function POST(req: Request) {
  let body: { siteId?: string; label?: string; provider?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '无效的 JSON' }, { status: 400 });
  }
  if (!body?.siteId || !body?.key) return jsonError('siteId 和 key 必填', 400);
  const provider: Provider = ['deepseek', 'openai', 'openrouter', 'none'].includes(body.provider ?? '')
    ? (body.provider as Provider)
    : 'none';
  try {
    const key = saveKey(body.siteId, { label: body.label || '主 key', provider, key: body.key });
    return NextResponse.json({ key }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, 'Failed to save key', 400);
  }
}
