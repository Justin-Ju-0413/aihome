import { NextResponse } from 'next/server';
import { buildState } from '@/lib/sync/engine';
import { detectLegacyRepo, migrateLegacyRepo } from '@/lib/sync/migration';
import { handleRouteError } from '@/lib/api-response';

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
  } catch (err) {
    return handleRouteError(err, 'Failed to load sync status');
  }
}
