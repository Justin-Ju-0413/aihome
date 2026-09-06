import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rm } from 'fs/promises';
import { dirname } from 'path';
import matter from 'gray-matter';
import { scanDirectories } from '@/lib/scanner';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { isExistingPathWithinWorkspace, isWorkspaceRootPath } from '@/lib/path-security';
import { assertWritable } from '@/lib/readonly';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

async function getAuthorizedAgentPath(id: string): Promise<string | null> {
  const config = await getWorkspaceConfig();
  const result = await scanDirectories(config.paths);
  const agent = result.agents.find((candidate) => candidate.id === id);
  if (!agent || !await isExistingPathWithinWorkspace(agent.filePath, config.paths)) return null;
  return agent.filePath;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = await getAuthorizedAgentPath(id);
    if (!filePath) return jsonError('Path is outside the configured workspace', 403);

    const content = await readFile(filePath, 'utf-8');
    const dirPath = dirname(filePath);

    // Re-scan to get full agent info
    const result = await scanDirectories([dirPath]);
    const agent = result.agents.find(a => a.id === id);

    return NextResponse.json({
      ...agent,
      content,
      parsed: filePath.endsWith('SKILL.md') ? matter(content) : { data: {}, content }
    });
  } catch (err) {
    return handleRouteError(err, 'Agent not found', 404);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertWritable();
    const { id } = await params;
    const body = await readJsonBody<{ frontmatter?: Record<string, unknown>; body?: string; content: string }>(request);
    const filePath = await getAuthorizedAgentPath(id);
    if (!filePath) return jsonError('Path is outside the configured workspace', 403);
    
    let content: string;
    
    if (filePath.endsWith('SKILL.md')) {
      const { frontmatter, body: markdownBody } = body;
      content = matter.stringify(markdownBody || '', frontmatter || {});
    } else {
      content = body.content;
    }

    await writeFile(filePath, content, 'utf-8');
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertWritable();
    const { id } = await params;
    const filePath = await getAuthorizedAgentPath(id);
    if (!filePath) return jsonError('Path is outside the configured workspace', 403);
    const dirPath = dirname(filePath);

    // 保护：AGENTS.md 若位于 workspace 根目录，dirname 就是根本身——拒绝，
    // 否则递归 rm 会删掉整个配置数据目录
    const config = await getWorkspaceConfig();
    if (isWorkspaceRootPath(dirPath, config.paths)) {
      return jsonError('Refusing to delete a workspace root', 400);
    }

    // Delete the entire agent directory
    await rm(dirPath, { recursive: true, force: true });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}
