import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import type { WorkspaceConfig, AgentRelation } from './types';

// 配置目录：AIHOME_CONFIG_DIR 覆盖（与 sync/paths 的 env 惯例一致，测试隔离用）
const CONFIG_DIR = process.env.AIHOME_CONFIG_DIR ?? join(process.cwd(), '.aihome');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const LAYOUT_FILE = join(CONFIG_DIR, 'layout.json');
const RELATIONS_FILE = join(CONFIG_DIR, 'relations.json');

const DEFAULT_CONFIG: WorkspaceConfig = {
  name: 'AIHome',
  paths: [join(process.cwd(), 'data')],
  groups: [
    { id: 'default', name: 'Default', color: '#6366f1', description: 'Default group' },
    { id: 'agents', name: 'Agents', color: '#10b981', description: 'Agent definitions' },
    { id: 'skills', name: 'Skills', color: '#f59e0b', description: 'Skill definitions' }
  ],
  layout: {}
};

async function ensureConfigDir(): Promise<void> {
  try {
    await access(CONFIG_DIR);
  } catch {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

export async function getWorkspaceConfig(): Promise<WorkspaceConfig> {
  await ensureConfigDir();
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveWorkspaceConfig(config: WorkspaceConfig): Promise<void> {
  await ensureConfigDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function validateWorkspaceConfig(config: unknown): config is WorkspaceConfig {
  if (!config || typeof config !== 'object') return false;
  const value = config as Partial<WorkspaceConfig>;
  if (typeof value.name !== 'string' || value.name.trim().length === 0 || value.name.length > 100) return false;
  if (!Array.isArray(value.paths) || value.paths.length === 0 || value.paths.length > 32) return false;
  if (value.paths.some((path) => typeof path !== 'string' || path.trim().length === 0)) return false;
  if (!Array.isArray(value.groups) || value.groups.length === 0 || value.groups.length > 64) return false;
  const ids = new Set<string>();
  for (const group of value.groups) {
    if (!group || typeof group.id !== 'string' || typeof group.name !== 'string' || typeof group.color !== 'string') return false;
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(group.id) || ids.has(group.id)) return false;
    if (!/^#[0-9a-f]{6}$/i.test(group.color)) return false;
    ids.add(group.id);
  }
  return true;
}

export type AgentLayout = Record<string, { group: string; order: number }>;

export async function getLayout(): Promise<AgentLayout> {
  await ensureConfigDir();
  try {
    const data = await readFile(LAYOUT_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveLayout(layout: AgentLayout): Promise<void> {
  await ensureConfigDir();
  await writeFile(LAYOUT_FILE, JSON.stringify(layout, null, 2), 'utf-8');
}

export async function getRelations(): Promise<AgentRelation[]> {
  await ensureConfigDir();
  try {
    const data = await readFile(RELATIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveRelations(relations: AgentRelation[]): Promise<void> {
  await ensureConfigDir();
  await writeFile(RELATIONS_FILE, JSON.stringify(relations, null, 2), 'utf-8');
}
