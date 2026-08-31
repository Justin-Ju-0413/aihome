import { NextRequest, NextResponse } from 'next/server';
import { unlockVault } from '@/lib/vault';

export async function POST(request: NextRequest) {
  try {
    const { password } = (await request.json()) as { password?: string };
    if (!password || password.length < 8) {
      return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 });
    }
    const result = unlockVault(password);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error === 'corrupt' ? 'vault 文件损坏或密码错误' : '密码错误' },
        { status: result.error === 'corrupt' ? 500 : 401 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}