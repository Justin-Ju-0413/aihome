import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { syncSkills } from '@/lib/registry/sync-engine';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    const body = (await req.json().catch(() => ({}))) as { platform?: string; skillId?: string };
    const reg = new Registry();
    reg.open();
    const results = syncSkills(reg, { dryRun, platform: body.platform, skillId: body.skillId });
    reg.close();
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Registry sync error:', error);
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 });
  }
}
