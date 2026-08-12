import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { NewSkill, PlatformRow, SkillRow, SyncStateRow, SyncStatus } from './types';

export function getRegistryDir(): string {
  return process.env.AIHOME_REGISTRY_DIR ?? path.join(os.homedir(), '.aihome');
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class Registry {
  private db: DatabaseSync | null = null;

  open(): void {
    const dir = getRegistryDir();
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(path.join(dir, 'registry.db'));
    this.migrate();
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  version(): number {
    const row = this.db!.prepare('PRAGMA user_version').get() as { user_version: number };
    return row.user_version;
  }

  migrate(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        source_dir TEXT NOT NULL,
        installed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS platforms (
        name TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        install_dir TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_links (
        skill_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT NOT NULL DEFAULT '',
        linked_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (skill_id, platform)
      );
    `);
    if (this.version() < 1) {
      this.db!.exec('PRAGMA user_version = 1');
    }
  }

  addSkill(skill: NewSkill): string {
    const id = slugify(skill.name) || 'skill';
    this.db!.prepare(
      'INSERT OR REPLACE INTO skills (id, name, description, source_dir) VALUES (?, ?, ?, ?)'
    ).run(id, skill.name, skill.description, skill.source_dir);
    return id;
  }

  listSkills(): SkillRow[] {
    return this.db!.prepare('SELECT * FROM skills ORDER BY name').all() as unknown as SkillRow[];
  }

  deleteSkill(id: string): void {
    this.db!.prepare('DELETE FROM sync_links WHERE skill_id = ?').run(id);
    this.db!.prepare('DELETE FROM skills WHERE id = ?').run(id);
  }

  setSyncState(skillId: string, platform: string, status: SyncStatus, error = ''): void {
    this.db!
      .prepare(
        `INSERT OR REPLACE INTO sync_links (skill_id, platform, status, error, linked_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run(skillId, platform, status, error);
  }

  getSyncState(skillId: string, platform: string): SyncStateRow | null {
    const row = this.db!
      .prepare('SELECT * FROM sync_links WHERE skill_id = ? AND platform = ?')
      .get(skillId, platform) as SyncStateRow | undefined;
    return row ?? null;
  }

  listPlatforms(): PlatformRow[] {
    return this.db!.prepare('SELECT * FROM platforms ORDER BY name').all() as unknown as PlatformRow[];
  }

  registerPlatform(name: string, installDir: string): void {
    this.db!
      .prepare('INSERT OR IGNORE INTO platforms (name, enabled, install_dir) VALUES (?, 0, ?)')
      .run(name, installDir);
  }

  setPlatformEnabled(name: string, enabled: boolean): void {
    this.db!.prepare('UPDATE platforms SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);
  }
}
