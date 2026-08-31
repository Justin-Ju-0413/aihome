import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { DatabaseSync } from 'node:sqlite';
import { getValues } from './settings';

/** Hermes CLI/数据桥接（原 hermes-adapter.js 移植，state.db 改 node:sqlite 只读） */

export function getHermesHome(): string {
  const custom = getValues()['connection.hermes_home_dir'];
  return (custom && custom.trim()) || process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
}

export function getHermesCli(): string {
  const custom = getValues()['connection.hermes_cli_path'];
  return (custom && custom.trim()) || process.env.HERMES_CLI || 'hermes';
}

const HERMES_DB = (): string => path.join(getHermesHome(), 'state.db');
const HERMES_CONFIG = (): string => path.join(getHermesHome(), 'config.yaml');
const HERMES_SKILLS_DIR = (): string => path.join(getHermesHome(), 'skills');

let hermesDb: DatabaseSync | null = null;

export function isAvailable(): boolean {
  return fs.existsSync(HERMES_DB());
}

function getDb(): DatabaseSync | null {
  if (!hermesDb && isAvailable()) {
    try {
      hermesDb = new DatabaseSync(HERMES_DB(), { readOnly: true });
    } catch {
      return null;
    }
  }
  return hermesDb;
}

type Row = Record<string, unknown>;

export function getSessions(limit = 20): Row[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare(
      `SELECT id, source, model, title, message_count, tool_call_count,
              input_tokens, output_tokens, reasoning_tokens,
              estimated_cost_usd, actual_cost_usd,
              datetime(started_at, 'unixepoch', 'localtime') as started_at,
              datetime(ended_at, 'unixepoch', 'localtime') as ended_at,
              end_reason, parent_session_id
       FROM sessions ORDER BY started_at DESC LIMIT ?`
    ).all(limit) as Row[];
  } catch {
    return [];
  }
}

export function getSessionDetail(sessionId: string): Row | null {
  const db = getDb();
  if (!db) return null;
  try {
    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as Row | undefined;
    if (!session) return null;
    const messages = db.prepare(
      `SELECT id, role, content, tool_name, tool_calls, tool_call_id,
              token_count, datetime(timestamp, 'unixepoch', 'localtime') as time,
              reasoning
       FROM messages WHERE session_id = ? ORDER BY timestamp ASC`
    ).all(sessionId) as Row[];
    return { ...session, messages };
  } catch {
    return null;
  }
}

export function getSessionStats(): Row | null {
  const db = getDb();
  if (!db) return null;
  try {
    const total = db.prepare(`SELECT COUNT(*) as count FROM sessions`).get() as Row;
    const tokens = db.prepare(`SELECT SUM(input_tokens) as input, SUM(output_tokens) as output, SUM(reasoning_tokens) as reasoning FROM sessions`).get() as Row;
    const cost = db.prepare(`SELECT SUM(estimated_cost_usd) as estimated, SUM(actual_cost_usd) as actual FROM sessions`).get() as Row;
    const models = db.prepare(`SELECT model, COUNT(*) as count FROM sessions GROUP BY model ORDER BY count DESC LIMIT 10`).all() as Row[];
    const sources = db.prepare(`SELECT source, COUNT(*) as count FROM sessions GROUP BY source ORDER BY count DESC`).all() as Row[];
    return {
      totalSessions: Number(total?.count ?? 0),
      totalInputTokens: Number(tokens?.input ?? 0),
      totalOutputTokens: Number(tokens?.output ?? 0),
      totalReasoningTokens: Number(tokens?.reasoning ?? 0),
      estimatedCost: Number(cost?.estimated ?? 0),
      actualCost: Number(cost?.actual ?? 0),
      models,
      sources,
    };
  } catch {
    return null;
  }
}

export function getSkills(): Row[] {
  if (!fs.existsSync(HERMES_SKILLS_DIR())) return [];
  try {
    const categories = fs.readdirSync(HERMES_SKILLS_DIR()).filter((d) => {
      try {
        return fs.statSync(path.join(HERMES_SKILLS_DIR(), d)).isDirectory();
      } catch {
        return false;
      }
    });
    const settings = getValues();
    const skillFilter = settings['connection.hermes_skill_filter'] || '';
    const allowedCats = skillFilter ? skillFilter.split(',').map((s) => s.trim()).filter(Boolean) : null;
    const skills: Row[] = [];
    const skillsRoot = path.resolve(HERMES_SKILLS_DIR());
    for (const cat of categories) {
      if (allowedCats && !allowedCats.includes(cat)) continue;
      const catPath = path.resolve(skillsRoot, cat);
      if (!catPath.startsWith(skillsRoot + path.sep)) continue;
      const files = fs.readdirSync(catPath).filter((f) => f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml'));
      for (const file of files) {
        const filePath = path.resolve(catPath, file);
        if (!filePath.startsWith(catPath + path.sep)) continue;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const nameMatch = content.match(/(?:^|\n)(?:name|skill_name)[:\s]+(.+)/);
          const descMatch = content.match(/(?:^|\n)(?:description|desc)[:\s]+(.+)/);
          skills.push({
            category: cat,
            name: nameMatch ? nameMatch[1].trim() : file.replace(/\.(md|ya?ml)$/, ''),
            description: descMatch ? descMatch[1].trim() : '',
            file: filePath,
            type: file.endsWith('.md') ? 'markdown' : 'yaml',
          });
        } catch {
          // 单个技能解析失败跳过
        }
      }
    }
    return skills;
  } catch {
    return [];
  }
}

export function getConfig(): Record<string, Record<string, string>> | null {
  if (!fs.existsSync(HERMES_CONFIG())) return null;
  try {
    const content = fs.readFileSync(HERMES_CONFIG(), 'utf-8');
    const config: Record<string, Record<string, string>> = {};
    let currentSection = 'general';
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const sectionMatch = trimmed.match(/^(\w+):/);
      if (sectionMatch && !line.startsWith(' ')) {
        currentSection = sectionMatch[1];
        config[currentSection] = {};
        continue;
      }
      const kvMatch = trimmed.match(/^(\w+):\s*(.+)/);
      if (kvMatch) {
        if (!config[currentSection]) config[currentSection] = {};
        config[currentSection][kvMatch[1]] = kvMatch[2];
      }
    }
    return config;
  } catch {
    return null;
  }
}

export interface HermesProcessHandle {
  pid: number | null;
  onOutput: (cb: (data: string) => void) => void;
  onError: (cb: (data: string) => void) => void;
  onClose: (cb: (code: number | null) => void) => void;
  kill: () => void;
  proc: ChildProcess;
}

export function launchHermes(prompt: string, options: { model?: string; skill?: string; cwd?: string } = {}): HermesProcessHandle {
  const args: string[] = [];
  if (prompt) args.push(prompt);
  const settings = getValues();
  const model = options.model || settings['connection.hermes_default_model'] || '';
  const cli = getHermesCli();
  if (model) args.push('--model', model);
  if (options.skill) args.push('--skill', options.skill);

  const proc = spawn(cli, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, HERMES_HOME: getHermesHome() },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    pid: proc.pid ?? null,
    onOutput: (cb) => proc.stdout.on('data', (d) => cb(d.toString())),
    onError: (cb) => proc.stderr.on('data', (d) => cb(d.toString())),
    onClose: (cb) => proc.on('close', cb),
    kill: () => proc.kill('SIGTERM'),
    proc,
  };
}

export function getRecentMessages(sessionId: string, limit = 50): Row[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare(
      `SELECT id, role, content, tool_name, datetime(timestamp, 'unixepoch', 'localtime') as time
       FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?`
    ).all(sessionId, limit) as Row[];
  } catch {
    return [];
  }
}

export function getMemories(): Array<{ name: string; content: string; full_path: string }> {
  const memDir = path.join(getHermesHome(), 'memories');
  if (!fs.existsSync(memDir)) return [];
  try {
    const files = fs.readdirSync(memDir).filter((f) => f.endsWith('.md'));
    return files.map((f) => {
      const content = fs.readFileSync(path.join(memDir, f), 'utf-8');
      return { name: f, content: content.substring(0, 500), full_path: path.join(memDir, f) };
    });
  } catch {
    return [];
  }
}
