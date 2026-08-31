import { NextRequest, NextResponse } from 'next/server';
import { getStatus } from '@/lib/vault';

export async function GET(_request: NextRequest) {
  try {
    return NextResponse.json(getStatus());
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}