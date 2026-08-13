import { NextResponse } from 'next/server';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { checkWorkspace } from '@/lib/health';

export async function GET() {
  try {
    const config = await getWorkspaceConfig();
    const issues = await checkWorkspace(config.paths);
    return NextResponse.json({ ok: issues.length === 0, issues });
  } catch (error) {
    console.error('Workspace health error:', error);
    return NextResponse.json({ error: 'Failed to check workspace health' }, { status: 500 });
  }
}
