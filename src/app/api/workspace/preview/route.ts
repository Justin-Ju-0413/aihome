import { NextRequest, NextResponse } from 'next/server';
import { scanDirectories } from '@/lib/scanner';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { paths?: unknown };
    if (!Array.isArray(body.paths) || body.paths.length === 0 || body.paths.some((p) => typeof p !== 'string')) {
      return NextResponse.json({ error: 'paths must be a non-empty string array' }, { status: 400 });
    }
    // 预览扫描不保存、不命中缓存，返回摘要供向导第二步展示
    const result = await scanDirectories(body.paths as string[], { cache: false });
    return NextResponse.json({
      count: result.agents.length,
      agents: result.agents.map((a) => ({ id: a.id, name: a.name, type: a.type })),
      errors: result.errors,
    });
  } catch (error) {
    console.error('Workspace preview error:', error);
    return NextResponse.json({ error: 'Failed to preview workspace' }, { status: 500 });
  }
}
