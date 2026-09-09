import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/api-response';
import { detectTools } from '@/lib/tools';

/** GET /api/tools — 本机 AI 工具检测（?refresh=1 绕过 TTL 缓存） */
export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === '1';
    const tools = await detectTools({ refresh });
    return NextResponse.json(tools);
  } catch (err) {
    return handleRouteError(err, '检测本机 AI 工具失败');
  }
}
