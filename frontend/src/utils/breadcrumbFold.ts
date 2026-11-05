/**
 * Which crumbs fold into "…" when a path doesn't fit (Phase 6, 3.3).
 *
 * Crumbs are numbered from the top folder (0) to the current one (n - 1).
 * Folding takes the folders right after the top one first, working towards
 * the current folder, so the strip keeps its two anchors (where the path
 * starts and where you are) as long as it can; the top folder goes last.
 * The current folder never folds.
 *
 * @param n number of crumbs (not counting Home)
 * @param count how many to fold; clamped to 0..n-1
 * @returns the folded indices, ascending (always one contiguous run)
 */
export function foldedCrumbs(n: number, count: number): number[] {
  const max = Math.max(0, n - 1);
  const k = Math.min(Math.max(0, Math.floor(count)), max);
  if (k === 0) return [];
  // Middle crumbs are 1..n-2; once they're all gone the top one (0) joins.
  const middle = Math.max(0, n - 2);
  if (k <= middle) return Array.from({ length: k }, (_, i) => i + 1);
  return Array.from({ length: n - 1 }, (_, i) => i);
}
