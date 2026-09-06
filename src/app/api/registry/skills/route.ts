import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { ensurePlatformsRegistered } from '@/lib/registry/adapters';
import { handleRouteError } from '@/lib/api-response';

export async function GET() {
  const reg = new Registry();
  try {
    reg.open();
    ensurePlatformsRegistered(reg);
    const skills = reg.listSkills();
    const platforms = reg.listPlatforms();
    const enriched = skills.map((s) => ({
      ...s,
      platforms: platforms.map((p) => ({
        name: p.name,
        enabled: p.enabled === 1,
        status: reg.getSyncState(s.id, p.name)?.status ?? 'none',
      })),
    }));
    return NextResponse.json({ skills: enriched, platforms });
  } catch (err) {
    return handleRouteError(err, 'Failed to load registry');
  } finally {
    reg.close();
  }
}
