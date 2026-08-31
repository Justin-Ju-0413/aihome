import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import matter from 'gray-matter';
import type { AgentNode, ScanResult } from './types';
import { parseAgentsMd } from './parser';
import { ScanCache } from './scan-cache';
import type { ParseOutcome } from './scan-cache';
import { extractDependencyNamesFromSections, normalizeDepNames, resolveDependencies } from './dependencies';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  '.cache', 'tmp', 'temp', '__pycache__', 'venv', '.venv'
]);

const MAX_DEPTH = 5;

export interface ScanOptions {
  cache?: boolean;
}

// 进程内模块级缓存实例：跨 scanDirectories 调用复用，满足 spec 成功标准
// "二次扫描命中，reads=0"。cache:false 时按调用屏蔽。
const scanCache = new ScanCache();

export async function scanDirectories(paths: string[], options?: ScanOptions): Promise<ScanResult> {
  const cache = options?.cache === false ? null : scanCache;
  const agents: AgentNode[] = [];
  const errors: string[] = [];
  const scannedPaths: string[] = [];
  // agent id -> declared dependency names (resolved to ids in a second pass)
  const depNamesByAgentId = new Map<string, string[]>();
  const claudeMdFiles: Array<{ filePath: string; dirPath: string }> = [];

  for (const basePath of paths) {
    try {
      const absPath = resolve(basePath);
      await scanDirectory(absPath, absPath, agents, 0, depNamesByAgentId, claudeMdFiles, cache);
      scannedPaths.push(absPath);
    } catch (err) {
      errors.push(`Failed to scan ${basePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await mergeClaudeMdNodes(agents, claudeMdFiles, depNamesByAgentId, cache);
  resolveDependencies(agents, depNamesByAgentId);

  const result: ScanResult = {
    agents,
    errors,
    scannedPaths,
    timestamp: new Date().toISOString()
  };
  if (cache) result.scanStats = cache.stats;
  return result;
}

async function scanDirectory(
  dirPath: string,
  basePath: string,
  agents: AgentNode[],
  depth: number,
  depNamesByAgentId: Map<string, string[]>,
  claudeMdFiles: Array<{ filePath: string; dirPath: string }>,
  cache: ScanCache | null
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
      await scanDirectory(fullPath, basePath, agents, depth + 1, depNamesByAgentId, claudeMdFiles, cache);
    } else if (entry.name === 'AGENTS.md') {
      try {
        const agent = await parseAgentsMdFile(fullPath, dirPath, depNamesByAgentId, cache);
        if (agent) agents.push(agent);
      } catch (err) {
        console.error(`Failed to parse ${fullPath}:`, err);
      }
    } else if (entry.name === 'SKILL.md') {
      try {
        const skill = await parseSkillMdFile(fullPath, dirPath, depNamesByAgentId, cache);
        if (skill) agents.push(skill);
      } catch (err) {
        console.error(`Failed to parse ${fullPath}:`, err);
      }
    } else if (entry.name === 'CLAUDE.md') {
      claudeMdFiles.push({ filePath: fullPath, dirPath });
    }
  }
}

async function parseAgentsMdFile(
  filePath: string,
  dirPath: string,
  depNamesByAgentId: Map<string, string[]>,
  cache: ScanCache | null
): Promise<AgentNode | null> {
  const st = await stat(filePath);
  if (cache) {
    const fp = cache.fileFingerprint(st);
    const hit = cache.getFile(filePath, fp);
    if (hit) {
      hit.node.associatedFiles = await countAssociatedFiles(dirPath, cache);
      depNamesByAgentId.set(hit.node.id, hit.depNames);
      return hit.node;
    }
    const outcome = await buildAgentsOutcome(filePath, dirPath, st, cache);
    cache.setFile(filePath, fp, outcome);
    depNamesByAgentId.set(outcome.node.id, outcome.depNames);
    return outcome.node;
  }
  const outcome = await buildAgentsOutcome(filePath, dirPath, st, null);
  depNamesByAgentId.set(outcome.node.id, outcome.depNames);
  return outcome.node;
}

async function buildAgentsOutcome(
  filePath: string,
  dirPath: string,
  st: Awaited<ReturnType<typeof stat>>,
  cache: ScanCache | null
): Promise<ParseOutcome> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseAgentsMd(content);
  const associatedFiles = await countAssociatedFiles(dirPath, cache);

  const node: AgentNode = {
    id: generateId(filePath),
    name: parsed.name || 'Untitled Agent',
    type: 'agent',
    ruleFiles: ['AGENTS.md'],
    description: parsed.description || '',
    filePath,
    dirPath,
    status: 'active',
    associatedFiles,
    dependencies: [],
    calledBy: [],
    group: 'default',
    position: { x: 0, y: 0 },
    createdAt: st.birthtime.toISOString(),
    updatedAt: st.mtime.toISOString()
  };

  return { node, depNames: extractDependencyNamesFromSections(parsed.sections) };
}

async function parseSkillMdFile(
  filePath: string,
  dirPath: string,
  depNamesByAgentId: Map<string, string[]>,
  cache: ScanCache | null
): Promise<AgentNode | null> {
  const st = await stat(filePath);
  if (cache) {
    const fp = cache.fileFingerprint(st);
    const hit = cache.getFile(filePath, fp);
    if (hit) {
      hit.node.associatedFiles = await countAssociatedFiles(dirPath, cache);
      depNamesByAgentId.set(hit.node.id, hit.depNames);
      return hit.node;
    }
    const outcome = await buildSkillOutcome(filePath, dirPath, st, cache);
    cache.setFile(filePath, fp, outcome);
    depNamesByAgentId.set(outcome.node.id, outcome.depNames);
    return outcome.node;
  }
  const outcome = await buildSkillOutcome(filePath, dirPath, st, null);
  depNamesByAgentId.set(outcome.node.id, outcome.depNames);
  return outcome.node;
}

async function buildSkillOutcome(
  filePath: string,
  dirPath: string,
  st: Awaited<ReturnType<typeof stat>>,
  cache: ScanCache | null
): Promise<ParseOutcome> {
  const content = await readFile(filePath, 'utf-8');
  const { data, content: body } = matter(content);
  const associatedFiles = await countAssociatedFiles(dirPath, cache);

  const name = data.name || extractFirstHeading(body) || 'Untitled Skill';
  const description = data.description || extractFirstParagraph(body) || '';

  const node: AgentNode = {
    id: generateId(filePath),
    name,
    type: 'skill',
    ruleFiles: ['SKILL.md'],
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
    createdAt: st.birthtime.toISOString(),
    updatedAt: st.mtime.toISOString()
  };

  return { node, depNames: normalizeDepNames(data['depends-on'] ?? data.dependencies) };
}

/**
 * 扫描完成后处理 CLAUDE.md：同目录已有 agent 节点(AGENTS.md)则合并
 * ruleFiles 标记；否则生成独立 agent 节点。解析复用 parseAgentsMd。
 */
async function mergeClaudeMdNodes(
  agents: AgentNode[],
  claudeMdFiles: Array<{ filePath: string; dirPath: string }>,
  depNamesByAgentId: Map<string, string[]>,
  cache: ScanCache | null
): Promise<void> {
  for (const claude of claudeMdFiles) {
    const existing = agents.find(
      a => a.dirPath === claude.dirPath && a.type === 'agent'
    );
    if (existing) {
      if (!existing.ruleFiles.includes('CLAUDE.md')) existing.ruleFiles.push('CLAUDE.md');
      continue;
    }
    const node = await parseClaudeMdFile(claude.filePath, claude.dirPath, depNamesByAgentId, cache);
    if (node) agents.push(node);
  }
}

async function parseClaudeMdFile(
  filePath: string,
  dirPath: string,
  depNamesByAgentId: Map<string, string[]>,
  cache: ScanCache | null
): Promise<AgentNode | null> {
  const st = await stat(filePath);
  if (cache) {
    const fp = cache.fileFingerprint(st);
    const hit = cache.getFile(filePath, fp);
    if (hit) {
      hit.node.associatedFiles = await countAssociatedFiles(dirPath, cache);
      depNamesByAgentId.set(hit.node.id, hit.depNames);
      return hit.node;
    }
    const outcome = await buildClaudeOutcome(filePath, dirPath, st, cache);
    cache.setFile(filePath, fp, outcome);
    depNamesByAgentId.set(outcome.node.id, outcome.depNames);
    return outcome.node;
  }
  const outcome = await buildClaudeOutcome(filePath, dirPath, st, null);
  depNamesByAgentId.set(outcome.node.id, outcome.depNames);
  return outcome.node;
}

async function buildClaudeOutcome(
  filePath: string,
  dirPath: string,
  st: Awaited<ReturnType<typeof stat>>,
  cache: ScanCache | null
): Promise<ParseOutcome> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseAgentsMd(content);
  const associatedFiles = await countAssociatedFiles(dirPath, cache);

  const node: AgentNode = {
    id: generateId(filePath),
    name: parsed.name || 'Untitled Agent',
    type: 'agent',
    description: parsed.description || '',
    filePath,
    dirPath,
    status: 'active',
    ruleFiles: ['CLAUDE.md'],
    associatedFiles,
    dependencies: [],
    calledBy: [],
    group: 'default',
    position: { x: 0, y: 0 },
    createdAt: st.birthtime.toISOString(),
    updatedAt: st.mtime.toISOString()
  };

  return { node, depNames: extractDependencyNamesFromSections(parsed.sections) };
}

async function countAssociatedFiles(
  dirPath: string,
  cache: ScanCache | null
): Promise<AgentNode['associatedFiles']> {
  const fresh = async (): Promise<AgentNode['associatedFiles']> => {
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
  };

  if (!cache) return fresh();

  const key = await dirFingerprint(dirPath);
  const hit = cache.getDir(dirPath, key);
  if (hit) return { ...hit.count };
  const count = await fresh();
  cache.setDir(dirPath, key, { count });
  return count;
}

// 目录统计的失效键：组合 4 个统计子目录各自的 mtime。
// 不能只用 dirPath 的 mtime——子目录内文件变化不会更新父目录 mtime。
async function dirFingerprint(dirPath: string): Promise<number> {
  const subs = ['scripts', 'references', 'assets', 'rules'];
  let fp = 0;
  for (const sub of subs) {
    let m = 0;
    try {
      m = Math.trunc((await stat(join(dirPath, sub))).mtimeMs);
    } catch {
      m = 0;
    }
    fp = (fp * 31 + 7 * m) | 0;
  }
  return fp;
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
