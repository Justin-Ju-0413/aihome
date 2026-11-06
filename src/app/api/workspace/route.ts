import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceConfig, saveWorkspaceConfig, validateWorkspaceConfig } from '@/lib/workspace-config';
import { assertWritable } from '@/lib/readonly';
import type { WorkspaceConfig } from '@/lib/types';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function GET() {
  try {
    const config = await getWorkspaceConfig();
    return NextResponse.json(config);
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}

export async function PUT(request: NextRequest) {
  try {
    await assertWritable();
    const body = await readJsonBody<Partial<WorkspaceConfig>>(request);
    const config = await getWorkspaceConfig();
    const updated = {
      name: body.name ?? config.name,
      paths: body.paths ?? config.paths,
      groups: body.groups ?? config.groups,
      layout: body.layout ?? config.layout,
    };
    if (!validateWorkspaceConfig(updated)) {
      return jsonError('Invalid workspace config', 400);
    }

    await saveWorkspaceConfig(updated);
    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}
