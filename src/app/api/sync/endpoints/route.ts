import { NextRequest, NextResponse } from 'next/server';
import { getEndpoints, setEndpoints, validateEndpointName } from '@/lib/sync/config';

export async function GET() {
  try {
    const endpoints = await getEndpoints();
    return NextResponse.json({ endpoints });
  } catch (error) {
    console.error('Sync endpoints error:', error);
    return NextResponse.json({ error: 'Failed to load endpoints' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const endpoints = body.endpoints;
    if (!endpoints || typeof endpoints !== 'object') {
      return NextResponse.json({ error: 'endpoints 必须是非空对象' }, { status: 400 });
    }
    const entries = Object.entries(endpoints as Record<string, unknown>);
    if (entries.some(([name, p]) => !validateEndpointName(name) || typeof p !== 'string' || !p.trim())) {
      return NextResponse.json({ error: '存在非法端名或空路径' }, { status: 400 });
    }
    await setEndpoints(endpoints as Record<string, string>);
    return NextResponse.json({ endpoints: await getEndpoints() });
  } catch (error) {
    console.error('Sync endpoints save error:', error);
    return NextResponse.json({ error: 'Failed to save endpoints' }, { status: 500 });
  }
}
