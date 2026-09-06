import { NextRequest, NextResponse } from 'next/server';
import { scanDirectories } from '@/lib/scanner';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { isExistingPathWithinWorkspace } from '@/lib/path-security';
import { handleRouteError, jsonError } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const config = await getWorkspaceConfig();
    
    // Use provided paths or fall back to config
    const paths = body.paths || config.paths;
    
    if (!Array.isArray(paths) || paths.length === 0 || paths.some((path) => typeof path !== 'string')) {
      return jsonError('No scan paths configured', 400);
    }

    const authorization = await Promise.all(
      paths.map((path) => isExistingPathWithinWorkspace(path, config.paths))
    );
    if (authorization.some((allowed) => !allowed)) {
      return jsonError('Scan path is outside the configured workspace', 403);
    }

    const result = await scanDirectories(paths);

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, 'Failed to scan directories');
  }
}
