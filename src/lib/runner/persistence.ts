import { mkdir, readFile, readdir, appendFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import type { Run, Pipeline, Schedule, RunnerSettings } from './types';

let dataDir = join(process.cwd(), 'data', 'runner');

export function setRunnerDataDir(dir: string): void {
  dataDir = dir;
}

export function getRunnerDataDir(): string {
  return dataDir;
}

async function ensureDir(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(join(dataDir, file), 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir();
  await writeFile(join(dataDir, file), JSON.stringify(value, null, 2), 'utf-8');
}

async function appendJsonLine(file: string, value: unknown): Promise<void> {
  await ensureDir();
  await appendFile(join(dataDir, file), JSON.stringify(value) + '\n', 'utf-8');
}

async function readLines(file: string): Promise<string[]> {
  try {
    const raw = await readFile(join(dataDir, file), 'utf-8');
    return raw.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export async function readRuns(): Promise<Run[]> {
  const lines = await readLines('runs.jsonl');
  const runs = lines.map((l) => {
    try { return JSON.parse(l) as Run; } catch { return null; }
  }).filter((r): r is Run => r !== null);
  return runs.reverse();
}

export async function appendRun(run: Run): Promise<void> {
  await appendJsonLine('runs.jsonl', run);
}

export async function readPipelines(): Promise<Pipeline[]> {
  return readJson<Pipeline[]>('pipelines.json', []);
}

export async function savePipelines(list: Pipeline[]): Promise<void> {
  await writeJson('pipelines.json', list);
}

export async function readSchedules(): Promise<Schedule[]> {
  return readJson<Schedule[]>('schedules.json', []);
}

export async function saveSchedules(list: Schedule[]): Promise<void> {
  await writeJson('schedules.json', list);
}

export const DEFAULT_SETTINGS: RunnerSettings = {
  maxConcurrent: 3,
  defaultDir: process.cwd(),
  defaultProvider: 'claude',
  timeoutMinutes: 0,
  redactBeforeSend: false,
};

export async function readSettings(): Promise<RunnerSettings> {
  const saved = await readJson<Partial<RunnerSettings>>('settings.json', {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(s: RunnerSettings): Promise<void> {
  await writeJson('settings.json', s);
}

export async function getDataFileNames(): Promise<string[]> {
  try { await access(dataDir); } catch { return []; }
  return readdir(dataDir);
}
