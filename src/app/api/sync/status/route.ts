import { NextResponse } from 'next/server';
import { buildState } from '@/lib/sync/engine';
import { detectLegacyRepo, migrateLegacyRepo } from '@/lib/sync/migration';

export async function GET() {
  try {
    const state = await buildState();
    const legacyPath = await detectLegacyRepo();
    const legacy: { present: boolean; migrated: boolean; copiedSkills?: number } = {
      present: legacyPath !== null,
      migrated: false,
    };
    if (legacyPath !== null) {
      const result = await migrateLegacyRepo();
      legacy.migrated = true;
      if (result.migrated) legacy.copiedSkills = result.copiedSkills;
    }
    return NextResponse.json({ state, legacy });
  } catch (error) {
    console.error('Sync status error:', error);
    return NextResponse.json({ error: 'Failed to load sync status' }, { status: 500 });
  }
}
