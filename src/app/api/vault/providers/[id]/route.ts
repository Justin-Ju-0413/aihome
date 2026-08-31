import { NextRequest, NextResponse } from 'next/server';
import { removeProvider } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    touchSession();
    const { id } = await ctx.params;
    const result = removeProvider(id);
    if (!result.ok) {
      return NextResponse.json(
        { error: (result as { error?: string }).error ?? 'bad request' },
        { status: (result as { status?: number }).status ?? 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}