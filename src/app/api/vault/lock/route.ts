import { NextRequest, NextResponse } from 'next/server';
import { lockVault } from '@/lib/vault';

export async function POST(_request: NextRequest) {
  try {
    lockVault();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}