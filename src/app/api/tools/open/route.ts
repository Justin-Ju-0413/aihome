import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handleRouteError, HttpError, readJsonBody } from '@/lib/api-response';
import { findCatalogEntry, openTool } from '@/lib/tools';

/**
 * POST /api/tools/open — 打开工具（应用 / CLI 配置目录）。
 * 仅接受目录表内的 toolId；路径与命令均来自服务端常量（见 src/lib/tools.ts openTool）。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<{ toolId?: string }>(request);
    const entry = findCatalogEntry(body.toolId ?? '');
    if (!entry) throw new HttpError(404, '未知工具');
    const result = openTool(entry);
    if (!result.ok) throw new HttpError(501, '当前平台不支持该操作');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, '打开工具失败');
  }
}
