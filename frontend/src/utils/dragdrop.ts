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

/**
 * Canonicalize a resource URL for identity comparison: drop a single
 * trailing slash and decode percent-escapes. This makes the two shapes the
 * app produces for the SAME path compare equal — folder urls carry a
 * trailing slash (`/files/foo/`) while a computed move destination does not
 * (`/files/foo`).
 */
function canonicalUrl(url: string): string {
  const trimmed = url.endsWith("/") ? url.slice(0, -1) : url;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * True when a move's source and destination resolve to the SAME path —
 * i.e. dropping an item exactly where it already lives. This is a no-op we
 * must refuse (dropping a folder "onto itself"). Compared canonically so a
 * folder's trailing-slash url matches the slash-less destination.
 */
export function isNoopMove(fromUrl: string, toUrl: string): boolean {
  return canonicalUrl(fromUrl) === canonicalUrl(toUrl);
}
