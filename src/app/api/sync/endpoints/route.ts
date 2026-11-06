import { NextRequest, NextResponse } from 'next/server';
import { getEndpoints, setEndpoints, validateEndpointName } from '@/lib/sync/config';
import { handleRouteError, jsonError } from '@/lib/api-response';

export async function GET() {
  try {
    const endpoints = await getEndpoints();
    return NextResponse.json({ endpoints });
  } catch (err) {
    return handleRouteError(err, 'Failed to load endpoints');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const endpoints = body.endpoints;
    if (!endpoints || typeof endpoints !== 'object') {
      return jsonError('endpoints 必须是非空对象', 400);
    }
    const entries = Object.entries(endpoints as Record<string, unknown>);
    if (entries.some(([name, p]) => !validateEndpointName(name) || typeof p !== 'string' || !p.trim())) {
      return jsonError('存在非法端名或空路径', 400);
    }
    await setEndpoints(endpoints as Record<string, string>);
    return NextResponse.json({ endpoints: await getEndpoints() });
  } catch (err) {
    return handleRouteError(err, 'Failed to save endpoints');
  }
}
