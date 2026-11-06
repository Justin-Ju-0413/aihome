import { NextResponse } from 'next/server';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { checkWorkspace } from '@/lib/health';
import { handleRouteError } from '@/lib/api-response';

export async function GET() {
  try {
    const config = await getWorkspaceConfig();
    const issues = await checkWorkspace(config.paths);
    return NextResponse.json({ ok: issues.length === 0, issues });
  } catch (err) {
    return handleRouteError(err, 'Failed to check workspace health');
  }
}
