import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { repoDir, commonDir } from './paths';
import { copyTree, scanSkills } from './checksum';

export async function detectLegacyRepo(): Promise<string | null> {
  const legacy = process.env.AIHOME_LEGACY_DIR ?? path.join(os.homedir(), 'skill-sync');
  try {
    await fs.access(path.join(legacy, 'common'));
    await fs.access(path.join(legacy, 'metadata.json'));
    return legacy;
  } catch {
    return null;
  }
}

export interface MigrationResult {
  migrated: boolean;
  copiedSkills: number;
  reason: 'no-legacy' | 'already-migrated' | 'ok';
}

export async function migrateLegacyRepo(): Promise<MigrationResult> {
  const legacy = await detectLegacyRepo();
  if (legacy === null) return { migrated: false, copiedSkills: 0, reason: 'no-legacy' };

  try {
    await fs.access(repoDir());
    return { migrated: false, copiedSkills: 0, reason: 'already-migrated' };
  } catch {
    // repo dir 不存在，继续迁移
  }

  await fs.mkdir(repoDir(), { recursive: true });
  const legacyCommon = path.resolve(legacy, 'common');
  if (!legacyCommon.startsWith(path.resolve(legacy) + path.sep)) throw new Error('legacy 路径非法');
  await copyTree(legacyCommon, commonDir());
  for (const file of ['metadata.json', 'MANIFEST.md']) {
    try {
      await fs.copyFile(path.join(legacy, file), path.join(repoDir(), file));
    } catch {
      // 可选文件缺失不阻塞迁移
    }
  }
  await fs.writeFile(path.join(repoDir(), '.migrated-from'), legacy, 'utf-8');

  let copiedSkills = 0;
  try {
    copiedSkills = Object.keys(await scanSkills(commonDir())).length;
  } catch {
    copiedSkills = 0;
  }
  return { migrated: true, copiedSkills, reason: 'ok' };
}
