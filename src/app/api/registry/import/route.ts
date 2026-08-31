import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { importSkill } from '@/lib/registry/sync-engine';
import { assertWritable } from '@/lib/readonly';

export async function POST(req: Request) {
  const reg = new Registry();
  try {
    await assertWritable();
    const body = (await req.json()) as { name: string; sourcePath: string };
    if (!body?.name || !body?.sourcePath) {
      return NextResponse.json({ error: 'name and sourcePath required' }, { status: 400 });
    }
    reg.open();
    const result = importSkill(reg, { name: body.name, sourcePath: body.sourcePath });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Registry import error:', error);
    return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request failed' },
        { status: (error as { status?: number }).status ?? 500 }
      );
  } finally {
    reg.close();
  }
}
