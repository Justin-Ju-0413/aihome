import { resolve } from 'path';

/**
 * Whether `targetPath` resolves to a location within one of the configured
 * workspace `rootPaths`. Uses lexical resolution to block `..` traversal.
 *
 * Note: symlink escapes are not handled. This is a local-only tool, so lexical
 * validation is sufficient to prevent accidental out-of-workspace access.
 */
export function isPathWithinWorkspace(
  targetPath: string,
  rootPaths: string[]
): boolean {
  const resolved = resolve(targetPath);
  return rootPaths.some((root) => {
    const r = resolve(root);
    return resolved === r || resolved.startsWith(r + '/');
  });
}
