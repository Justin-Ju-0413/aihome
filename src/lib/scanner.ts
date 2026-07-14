import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve, basename } from 'path';
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
  // agent id -> declared dependency names (resolved to ids in a second pass)
  const depNamesByAgentId = new Map<string, string[]>();

  for (const basePath of paths) {
    try {
      const absPath = resolve(basePath);
      await scanDirectory(absPath, absPath, agents, 0, depNamesByAgentId);
      scannedPaths.push(absPath);
    } catch (err) {
      errors.push(`Failed to scan ${basePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  resolveDependencies(agents, depNamesByAgentId);

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
  depth: number,
  depNamesByAgentId: Map<string, string[]>
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
      await scanDirectory(fullPath, basePath, agents, depth + 1, depNamesByAgentId);
    } else if (entry.name === 'AGENTS.md') {
      try {
        const agent = await parseAgentsMdFile(fullPath, dirPath, depNamesByAgentId);
        if (agent) agents.push(agent);
      } catch (err) {
        console.error(`Failed to parse ${fullPath}:`, err);
      }
    } else if (entry.name === 'SKILL.md') {
      try {
        const skill = await parseSkillMdFile(fullPath, dirPath, depNamesByAgentId);
        if (skill) agents.push(skill);
      } catch (err) {
        console.error(`Failed to parse ${fullPath}:`, err);
      }
    }
  }
}

async function parseAgentsMdFile(
  filePath: string,
  dirPath: string,
  depNamesByAgentId: Map<string, string[]>
): Promise<AgentNode | null> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseAgentsMd(content);
  const stats = await stat(filePath);
  const associatedFiles = await countAssociatedFiles(dirPath);

  const agent: AgentNode = {
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

  depNamesByAgentId.set(agent.id, extractDependencyNamesFromSections(parsed.sections));
  return agent;
}

async function parseSkillMdFile(
  filePath: string,
  dirPath: string,
  depNamesByAgentId: Map<string, string[]>
): Promise<AgentNode | null> {
  const content = await readFile(filePath, 'utf-8');
  const { data, content: body } = matter(content);
  const stats = await stat(filePath);
  const associatedFiles = await countAssociatedFiles(dirPath);

  const name = data.name || extractFirstHeading(body) || 'Untitled Skill';
  const description = data.description || extractFirstParagraph(body) || '';

  const agent: AgentNode = {
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

  depNamesByAgentId.set(agent.id, normalizeDepNames(data['depends-on'] ?? data.dependencies));
  return agent;
}

/**
 * Parse declared dependency names from an AGENTS.md `## Dependencies` (or
 * "Depends On" / "依赖") section. Accepts `- Name`, `- [[Name]]`,
 * `- [Name](path)`, and `` - `Name` `` list items.
 */
function extractDependencyNamesFromSections(
  sections: Array<{ title: string; content: string }>
): string[] {
  const depSection = sections.find(s =>
    /^(dependencies|depends[ -]on|依赖)$/i.test(s.title.trim())
  );
  if (!depSection) return [];

  const names: string[] = [];
  for (const line of depSection.content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue;
    const item = trimmed.replace(/^[-*]\s+/, '').trim();
    const wiki = item.match(/^\[\[([^\]]+)\]\]/);
    const md = item.match(/^\[([^\]]+)\]/);
    const code = item.match(/^`([^`]+)`/);
    const raw = wiki?.[1] || md?.[1] || code?.[1] || item;
    const name = raw.replace(/\s*\(.*\)$/, '').replace(/\s*:.*$/, '').trim();
    if (name) names.push(name);
  }
  return names;
}

function normalizeDepNames(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * Resolve declared dependency names to agent ids and populate the forward
 * (`dependencies`) and reverse (`calledBy`) links. Names match by agent name
 * or directory basename, case-insensitively.
 */
function resolveDependencies(agents: AgentNode[], depNamesByAgentId: Map<string, string[]>): void {
  const byName = new Map<string, AgentNode>();
  const byDir = new Map<string, AgentNode>();
  for (const a of agents) {
    byName.set(a.name.toLowerCase(), a);
    byDir.set(basename(a.dirPath).toLowerCase(), a);
  }

  for (const a of agents) {
    a.dependencies = [];
    a.calledBy = [];
  }

  for (const a of agents) {
    const names = depNamesByAgentId.get(a.id) ?? [];
    const depIds: string[] = [];
    for (const n of names) {
      const target = byName.get(n.toLowerCase()) ?? byDir.get(n.toLowerCase());
      if (target && target.id !== a.id && !depIds.includes(target.id)) {
        depIds.push(target.id);
        if (!target.calledBy.includes(a.id)) target.calledBy.push(a.id);
      }
    }
    a.dependencies = depIds;
  }
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
