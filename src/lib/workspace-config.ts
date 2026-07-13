import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import type { WorkspaceConfig, AgentGroup, AgentRelation } from './types';

const CONFIG_DIR = join(process.cwd(), '.aihome');
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

export async function getLayout(): Promise<Record<string, { x: number; y: number }>> {
  await ensureConfigDir();
  try {
    const data = await readFile(LAYOUT_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveLayout(layout: Record<string, { x: number; y: number }>): Promise<void> {
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
