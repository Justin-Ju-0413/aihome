import * as os from 'os';
import * as path from 'path';

export function configDir(): string {
  return process.env.AIHOME_CONFIG_DIR ?? path.join(os.homedir(), '.aihome');
}

export function repoDir(): string {
  return process.env.AIHOME_REPO_DIR ?? path.join(os.homedir(), '.aihome', 'repo');
}

export function commonDir(): string {
  return path.join(repoDir(), 'common');
}

export function metadataFile(): string {
  return path.join(repoDir(), 'metadata.json');
}
