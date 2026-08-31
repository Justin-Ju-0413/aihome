import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { syncSkills } from '@/lib/registry/sync-engine';
import { assertWritable } from '@/lib/readonly';

export async function POST(req: Request) {
  const reg = new Registry();
  try {
    await assertWritable();
    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    const body = (await req.json().catch(() => ({}))) as { platform?: string; skillId?: string };
    reg.open();
    const results = syncSkills(reg, { dryRun, platform: body.platform, skillId: body.skillId });
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Registry sync error:', error);
    return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request failed' },
        { status: (error as { status?: number }).status ?? 500 }
      );
  } finally {
    reg.close();
  }
}
