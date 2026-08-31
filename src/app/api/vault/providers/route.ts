import { NextRequest, NextResponse } from 'next/server';
import { upsertProvider } from '@/lib/vault';
import { touchSession } from '@/lib/vault/store';

export async function POST(request: NextRequest) {
  try {
    touchSession();
    const body = (await request.json()) as {
      id?: string; name?: string; baseUrl?: string; model?: string; apiKey?: string;
    };
    const result = upsertProvider({
      id: body.id, name: body.name ?? '', baseUrl: body.baseUrl ?? '',
      model: body.model ?? '', apiKey: body.apiKey ?? '',
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: (result as { error?: string }).error ?? 'bad request' },
        { status: (result as { status?: number }).status ?? 400 }
      );
    }
    return NextResponse.json({ provider: result.provider });
  } catch {
    return NextResponse.json({ error: 'vault 文件损坏或密码错误' }, { status: 500 });
  }
}