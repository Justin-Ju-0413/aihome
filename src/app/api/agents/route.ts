import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import { scanDirectories } from '@/lib/scanner';
import { getWorkspaceConfig } from '@/lib/workspace-config';
import { isExistingPathWithinWorkspace, isNewPathWithinWorkspace } from '@/lib/path-security';
import { filterByFullText } from '@/lib/search';
import { assertWritable } from '@/lib/readonly';
import { handleRouteError, jsonError, readJsonBody } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const config = await getWorkspaceConfig();
    // 默认开启进程内扫描缓存（见 src/lib/scan-cache.ts），无需透传；scanStats 不暴露为响应头
    const result = await scanDirectories(config.paths);
    const q = request.nextUrl.searchParams.get('q')?.trim();
    const full = request.nextUrl.searchParams.get('full') === '1';
    let agents = result.agents;
    if (q) {
      if (full) {
        // full=1：markdown 正文匹配（name/description 命中优先，无需读文件）
        agents = await filterByFullText(agents, q, (filePath) => readFile(filePath, 'utf-8'));
      } else {
        const needle = q.toLowerCase();
        agents = agents.filter(
          (a) => a.name.toLowerCase().includes(needle) || a.description.toLowerCase().includes(needle)
        );
      }
    }
    return NextResponse.json(agents);
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertWritable();
    const body = await readJsonBody<{ type: string; name?: string; description?: string; dirPath?: string }>(request);
    const { type, name, description, dirPath } = body;

    if (!['agent', 'skill'].includes(type) || typeof name !== 'string' || !name.trim()) {
      return jsonError('Type and name are required', 400);
    }

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) {
      return jsonError('Name must contain only letters, numbers, hyphens or underscores', 400);
    }

    const config = await getWorkspaceConfig();
    const baseDir = dirPath || config.paths[0];

    if (!baseDir) {
      return jsonError('No directory path provided', 400);
    }

    if (!await isExistingPathWithinWorkspace(baseDir, config.paths)) {
      return jsonError('Directory is outside the configured workspace', 403);
    }

    // Create agent/skill directory
    const agentDir = join(baseDir, slug);
    if (!await isNewPathWithinWorkspace(agentDir, config.paths)) {
      return jsonError('Directory is outside the configured workspace', 403);
    }
    await mkdir(agentDir, { recursive: true });

    let filePath: string;
    let content: string;

    if (type === 'skill') {
      filePath = join(agentDir, 'SKILL.md');
      const frontmatter = {
        name: slug,
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
  } catch (err) {
    return handleRouteError(err, 'Request failed');
  }
}
