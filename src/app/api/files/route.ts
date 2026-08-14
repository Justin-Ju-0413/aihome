import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { isExistingPathWithinWorkspace, isWritablePathWithinWorkspace } from '@/lib/path-security';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json(
        { error: 'Path parameter is required' },
        { status: 400 }
      );
    }

    const config = await getWorkspaceConfig();
    if (!await isExistingPathWithinWorkspace(path, config.paths)) {
      return NextResponse.json(
        { error: 'Path is outside the configured workspace' },
        { status: 403 }
      );
    }

    const content = await readFile(path, 'utf-8');
    return NextResponse.json({ content, path });
  } catch (error) {
    console.error('Failed to read file:', error);
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { path, content } = body;

    if (!path || content === undefined) {
      return NextResponse.json(
        { error: 'Path and content are required' },
        { status: 400 }
      );
    }

    const config = await getWorkspaceConfig();
    // 已存在路径（含符号链接）必须 realpath 后仍在 workspace 内；仅真正的新
    // 路径允许按父目录判定，避免符号链接跟随逃逸（旧 existing||new 组合绕过）
    const isAllowed = await isWritablePathWithinWorkspace(path, config.paths);
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Path is outside the configured workspace' },
        { status: 403 }
      );
    }

    await writeFile(path, content, 'utf-8');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to write file:', error);
    return NextResponse.json(
      { error: 'Failed to write file' },
      { status: 500 }
    );
  }
}
