import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_SOURCES, type ActiveUsageSource } from '@/lib/usage/types';
import { runIndex } from '@/lib/usage/indexer';
import { assertWritable } from '@/lib/readonly';

export async function POST(request: NextRequest) {
  try {
    await assertWritable();
    const text = await request.text();
    let body: Record<string, unknown> = {};
    if (text) {
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }
    const onlyParam = Array.isArray(body.only) ? body.only : undefined;
    const only: ActiveUsageSource[] | undefined = onlyParam
      ? onlyParam.filter((n: unknown) => ACTIVE_SOURCES.includes(n as ActiveUsageSource)) as ActiveUsageSource[]
      : undefined;
    const result = runIndex(only);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to rescan' },
      { status: 400 }
    );
  }
}
