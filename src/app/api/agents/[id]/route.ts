import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, rm } from 'fs/promises';
import { dirname } from 'path';
import matter from 'gray-matter';
import { scanDirectories } from '@/lib/scanner';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = Buffer.from(id, 'base64url').toString('utf-8');
    
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
    const { id } = await params;
    const body = await request.json();
    const filePath = Buffer.from(id, 'base64url').toString('utf-8');
    
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
      { error: 'Failed to update agent' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = Buffer.from(id, 'base64url').toString('utf-8');
    const dirPath = dirname(filePath);
    
    // Delete the entire agent directory
    await rm(dirPath, { recursive: true, force: true });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete agent:', error);
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    );
  }
}
