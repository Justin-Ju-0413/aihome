import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import { scanDirectories } from '@/lib/scanner';
import { getWorkspaceConfig } from '@/lib/workspace-config';

export async function GET() {
  try {
    const config = await getWorkspaceConfig();
    const result = await scanDirectories(config.paths);
    return NextResponse.json(result.agents);
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, name, description, dirPath } = body;

    if (!type || !name) {
      return NextResponse.json(
        { error: 'Type and name are required' },
        { status: 400 }
      );
    }

    const config = await getWorkspaceConfig();
    const baseDir = dirPath || config.paths[0];
    
    if (!baseDir) {
      return NextResponse.json(
        { error: 'No directory path provided' },
        { status: 400 }
      );
    }

    // Create agent/skill directory
    const agentDir = join(baseDir, name.toLowerCase().replace(/\s+/g, '-'));
    await mkdir(agentDir, { recursive: true });

    let filePath: string;
    let content: string;

    if (type === 'skill') {
      filePath = join(agentDir, 'SKILL.md');
      const frontmatter = {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        description: description || '',
        metadata: {
          created: new Date().toISOString()
        }
      };
      content = matter.stringify(`# ${name}\n\n${description || ''}\n`, frontmatter);
    } else {
      filePath = join(agentDir, 'AGENTS.md');
      content = `# ${name}\n\n${description || ''}\n`;
    }

    await writeFile(filePath, content, 'utf-8');

    // Re-scan to get the created agent
    const result = await scanDirectories([baseDir]);
    const created = result.agents.find(a => a.filePath === filePath);

    return NextResponse.json(created || { filePath, name, type });
  } catch (error) {
    console.error('Failed to create agent:', error);
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}
