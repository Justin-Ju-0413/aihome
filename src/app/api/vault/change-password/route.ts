import { NextRequest, NextResponse } from 'next/server';
import { changeVaultPassword } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';

export async function POST(request: NextRequest) {
  try {
    touchSession();
    const { oldPassword, newPassword } = (await request.json()) as { oldPassword?: string; newPassword?: string };
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 });
    }
    const result = changeVaultPassword(oldPassword ?? '', newPassword);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? '旧密码错误' }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}