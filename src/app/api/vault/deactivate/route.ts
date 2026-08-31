import { NextRequest, NextResponse } from 'next/server';
import { deactivateTool } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';
import type { ToolId } from '@/lib/vault/store';

const TOOLS: ToolId[] = ['claude-code', 'codex', 'opencode'];

export async function POST(request: NextRequest) {
  try {
    touchSession();
    const { tool } = (await request.json()) as { tool?: string };
    if (!tool || !TOOLS.includes(tool as ToolId)) {
      return NextResponse.json({ error: 'unknown tool' }, { status: 400 });
    }
    const result = deactivateTool(tool as ToolId);
    if (!result.ok) {
      return NextResponse.json(
        { error: (result as { error?: string }).error ?? 'bad request', conflictDetail: (result as { conflictDetail?: string }).conflictDetail },
        { status: (result as { status?: number }).status ?? 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}