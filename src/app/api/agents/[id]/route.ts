import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rm } from 'fs/promises';
import { dirname } from 'path';
import matter from 'gray-matter';
import { scanDirectories } from '@/lib/scanner';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { isExistingPathWithinWorkspace } from '@/lib/path-security';
import { assertWritable } from '@/lib/readonly';

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
    if (!filePath) return NextResponse.json({ error: 'Path is outside the configured workspace' }, { status: 403 });
    
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
  } catch (error) {
    console.error('Failed to fetch agent:', error);
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertWritable();
    const { id } = await params;
    const body = await request.json();
    const filePath = await getAuthorizedAgentPath(id);
    if (!filePath) return NextResponse.json({ error: 'Path is outside the configured workspace' }, { status: 403 });
    
    let content: string;
    
    if (filePath.endsWith('SKILL.md')) {
      const { frontmatter, body: markdownBody } = body;
      content = matter.stringify(markdownBody || '', frontmatter || {});
    } else {
      content = body.content;
    }

    await writeFile(filePath, content, 'utf-8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update agent:', error);
    return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request failed' },
        { status: (error as { status?: number }).status ?? 500 }
      );
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
    if (!filePath) return NextResponse.json({ error: 'Path is outside the configured workspace' }, { status: 403 });
    const dirPath = dirname(filePath);
    
    // Delete the entire agent directory
    await rm(dirPath, { recursive: true, force: true });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete agent:', error);
    return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request failed' },
        { status: (error as { status?: number }).status ?? 500 }
      );
  }
}
