import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import matter from 'gray-matter';
import type { AgentNode, ScanResult } from './types';
import { parseAgentsMd } from './parser';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  '.cache', 'tmp', 'temp', '__pycache__', 'venv', '.venv'
]);

const MAX_DEPTH = 5;

export async function scanDirectories(paths: string[]): Promise<ScanResult> {
  const agents: AgentNode[] = [];
  const errors: string[] = [];
  const scannedPaths: string[] = [];

  for (const basePath of paths) {
    try {
      const absPath = resolve(basePath);
      await scanDirectory(absPath, absPath, agents, 0);
      scannedPaths.push(absPath);
    } catch (err) {
      errors.push(`Failed to scan ${basePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    agents,
    errors,
    scannedPaths,
    timestamp: new Date().toISOString()
  };
}

async function scanDirectory(
  dirPath: string,
  basePath: string,
  agents: AgentNode[],
  depth: number
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.qoder') continue;
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, basePath, agents, depth + 1);
    } else if (entry.name === 'AGENTS.md') {
      try {
        const agent = await parseAgentsMdFile(fullPath, dirPath);
        if (agent) agents.push(agent);
      } catch (err) {
        console.error(`Failed to parse ${fullPath}:`, err);
      }
    } else if (entry.name === 'SKILL.md') {
      try {
        const skill = await parseSkillMdFile(fullPath, dirPath);
        if (skill) agents.push(skill);
      } catch (err) {
        console.error(`Failed to parse ${fullPath}:`, err);
      }
    }
  }
}

async function parseAgentsMdFile(filePath: string, dirPath: string): Promise<AgentNode | null> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseAgentsMd(content);
  const stats = await stat(filePath);
  const associatedFiles = await countAssociatedFiles(dirPath);

  return {
    id: generateId(filePath),
    name: parsed.name || 'Untitled Agent',
    type: 'agent',
    description: parsed.description || '',
    filePath,
    dirPath,
    status: 'active',
    associatedFiles,
    dependencies: [],
    calledBy: [],
    group: 'default',
    position: { x: 0, y: 0 },
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString()
  };
}

async function parseSkillMdFile(filePath: string, dirPath: string): Promise<AgentNode | null> {
  const content = await readFile(filePath, 'utf-8');
  const { data, content: body } = matter(content);
  const stats = await stat(filePath);
  const associatedFiles = await countAssociatedFiles(dirPath);

  const name = data.name || extractFirstHeading(body) || 'Untitled Skill';
  const description = data.description || extractFirstParagraph(body) || '';

  return {
    id: generateId(filePath),
    name,
    type: 'skill',
    description,
    filePath,
    dirPath,
    status: 'active',
    license: data.license,
    compatibility: data.compatibility,
    allowedTools: data['allowed-tools'] || data.allowedTools,
    metadata: data.metadata,
    associatedFiles,
    dependencies: [],
    calledBy: [],
    group: 'default',
    position: { x: 0, y: 0 },
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString()
  };
}

async function countAssociatedFiles(dirPath: string): Promise<AgentNode['associatedFiles']> {
  const counts = { scripts: 0, references: 0, assets: 0, rules: 0, total: 0 };

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === 'scripts') counts.scripts = await countFilesInDir(join(dirPath, entry.name));
        else if (entry.name === 'references') counts.references = await countFilesInDir(join(dirPath, entry.name));
        else if (entry.name === 'assets') counts.assets = await countFilesInDir(join(dirPath, entry.name));
        else if (entry.name === 'rules') counts.rules = await countFilesInDir(join(dirPath, entry.name));
      }
    }
  } catch {}

  counts.total = counts.scripts + counts.references + counts.assets + counts.rules;
  return counts;
}

async function countFilesInDir(dirPath: string): Promise<number> {
  try {
    const entries = await readdir(dirPath);
    return entries.length;
  } catch {
    return 0;
  }
}

function extractFirstHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractFirstParagraph(content: string): string | null {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      return trimmed.slice(0, 200);
    }
  }
  return null;
}

function generateId(filePath: string): string {
  return Buffer.from(filePath).toString('base64url');
}
