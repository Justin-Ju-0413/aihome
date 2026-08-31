import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, stat } from 'fs/promises';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { isExistingPathWithinWorkspace, isWritablePathWithinWorkspace } from '@/lib/path-security';
import { readJsonBody, jsonError, handleRouteError } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return jsonError('Path parameter is required', 400, 'PATH_REQUIRED');
    }

    const config = await getWorkspaceConfig();
    if (!await isExistingPathWithinWorkspace(path, config.paths)) {
      return jsonError('Path is outside the configured workspace', 403, 'OUTSIDE_WORKSPACE');
    }

    // 目录按文件读会抛 EISDIR → 用明确 400 而非模糊 500
    const st = await stat(path);
    if (st.isDirectory()) {
      return jsonError('Path is a directory', 400, 'IS_DIRECTORY');
    }

    const content = await readFile(path, 'utf-8');
    return NextResponse.json({ content, path });
  } catch (err) {
    return handleRouteError(err, 'Failed to read file', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await readJsonBody<{ path?: string; content?: string }>(request);
    const { path, content } = body;

    if (!path || content === undefined) {
      return jsonError('Path and content are required', 400, 'PATH_CONTENT_REQUIRED');
    }

    const config = await getWorkspaceConfig();
    // 已存在路径（含符号链接）必须 realpath 后仍在 workspace 内；仅真正的新
    // 路径允许按父目录判定，避免符号链接跟随逃逸（旧 existing||new 组合绕过）
    const isAllowed = await isWritablePathWithinWorkspace(path, config.paths);
    if (!isAllowed) {
      return jsonError('Path is outside the configured workspace', 403, 'OUTSIDE_WORKSPACE');
    }

    // 目标存在且为目录：阻止写入目录
    try {
      const st = await stat(path);
      if (st.isDirectory()) {
        return jsonError('Path is a directory', 400, 'IS_DIRECTORY');
      }
    } catch {
      // 目标不存在：允许新文件
    }

    await writeFile(path, content, 'utf-8');
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err, 'Failed to write file', 500);
  }
}
