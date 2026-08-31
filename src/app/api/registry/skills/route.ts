import { NextResponse } from 'next/server';
import { Registry } from '@/lib/registry/registry';
import { ensurePlatformsRegistered } from '@/lib/registry/adapters';

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
  } catch (error) {
    console.error('Registry skills error:', error);
    return NextResponse.json({ error: 'Failed to load registry' }, { status: 500 });
  } finally {
    reg.close();
  }
}
