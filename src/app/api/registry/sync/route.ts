import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { syncSkills } from '@/lib/registry/sync-engine';
import { assertWritable } from '@/lib/readonly';
import { handleRouteError } from '@/lib/api-response';

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
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  } finally {
    reg.close();
  }
}
