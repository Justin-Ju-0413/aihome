import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceConfig, saveWorkspaceConfig, validateWorkspaceConfig } from '@/lib/workspace-config';

export async function GET() {
  try {
    const config = await getWorkspaceConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('Failed to fetch workspace config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const config = await getWorkspaceConfig();
    const updated = {
      name: body.name ?? config.name,
      paths: body.paths ?? config.paths,
      groups: body.groups ?? config.groups,
      layout: body.layout ?? config.layout,
    };
    if (!validateWorkspaceConfig(updated)) {
      return NextResponse.json({ error: 'Invalid workspace config' }, { status: 400 });
    }
    
    await saveWorkspaceConfig(updated);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update workspace config:', error);
    return NextResponse.json(
      { error: 'Failed to update config' },
      { status: 500 }
    );
  }
}
