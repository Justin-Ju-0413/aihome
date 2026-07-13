import { NextRequest, NextResponse } from 'next/server';
import { scanDirectories } from '@/lib/scanner';
import { getWorkspaceConfig } from '@/lib/workspace-config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const config = await getWorkspaceConfig();
    
    // Use provided paths or fall back to config
    const paths = body.paths || config.paths;
    
    if (!paths || paths.length === 0) {
      return NextResponse.json(
        { error: 'No scan paths configured' },
        { status: 400 }
      );
    }

    const result = await scanDirectories(paths);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { error: 'Failed to scan directories' },
      { status: 500 }
    );
  }
}
