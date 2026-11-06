import { NextRequest, NextResponse } from 'next/server';
import { scanDirectories } from '@/lib/scanner';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<{ paths?: unknown }>(request);
    if (!Array.isArray(body.paths) || body.paths.length === 0 || body.paths.some((p) => typeof p !== 'string')) {
      return jsonError('paths must be a non-empty string array', 400);
    }
    // 预览扫描不保存、不命中缓存，返回摘要供向导第二步展示
    const result = await scanDirectories(body.paths as string[], { cache: false });
    return NextResponse.json({
      count: result.agents.length,
      agents: result.agents.map((a) => ({ id: a.id, name: a.name, type: a.type })),
      errors: result.errors,
    });
  } catch (err) {
    return handleRouteError(err, 'Failed to preview workspace');
  }
}
