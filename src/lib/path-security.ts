import { realpath } from 'fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'path';

/**
 * Whether `targetPath` resolves to a location within one of the configured
 * workspace `rootPaths`. Uses platform-aware lexical resolution to block `..`
 * traversal on both Windows and POSIX.
 */
export function isPathWithinWorkspace(
  targetPath: string,
  rootPaths: string[]
): boolean {
  const resolved = resolve(targetPath);
  return rootPaths.some((root) => {
    const rel = relative(resolve(root), resolved);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  });
}

async function existingWorkspaceRoots(rootPaths: string[]): Promise<string[]> {
  const roots = await Promise.all(rootPaths.map((root) => realpath(root).catch(() => null)));
  return roots.filter((root): root is string => root !== null);
}

/** Resolve symlinks before authorizing an existing path. */
export async function isExistingPathWithinWorkspace(
  targetPath: string,
  rootPaths: string[]
): Promise<boolean> {
  try {
    const [target, roots] = await Promise.all([
      realpath(targetPath),
      existingWorkspaceRoots(rootPaths),
    ]);
    return isPathWithinWorkspace(target, roots);
  } catch {
    return false;
  }
}

/** Authorize a new path by resolving its existing parent directory first. */
export async function isNewPathWithinWorkspace(
  targetPath: string,
  rootPaths: string[]
): Promise<boolean> {
  try {
    const [parent, roots] = await Promise.all([
      realpath(dirname(targetPath)),
      existingWorkspaceRoots(rootPaths),
    ]);
    return isPathWithinWorkspace(resolve(parent, basename(targetPath)), roots);
  } catch {
    return false;
  }
}
