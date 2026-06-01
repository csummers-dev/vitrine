// Shared drag-and-drop move/copy guards.

/** Normalize a folder URL to a single trailing slash for prefix comparison. */
export function asDir(url: string): string {
  return url.endsWith("/") ? url : url + "/";
}

/**
 * True when moving/copying `sourceUrl` INTO `destDir` would place a folder
 * inside itself or one of its own descendants — an illegal move (it would
 * create a cycle; the backend rejects it). Non-folders are always allowed.
 *
 * Comparison is by normalized trailing-slash prefix, so a sibling such as
 * `/files/foo2/` is NOT flagged against source `/files/foo/`.
 */
export function isSelfOrDescendantTarget(
  sourceUrl: string,
  isDir: boolean | undefined,
  destDir: string
): boolean {
  if (!isDir) return false;
  return asDir(destDir).startsWith(asDir(sourceUrl));
}
