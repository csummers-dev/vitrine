/**
 * useFolderScrollMemory — per-folder scroll-position memory for the file
 * listing, so returning to a folder you were recently in (even across an
 * unrelated directory jump) drops you back at the scroll position you left,
 * instead of snapping to the top.
 *
 * Model: a small `path → scrollTop` map (most-recent-position-per-folder),
 * bounded by an LRU cap so it can't grow without bound in a long session. It's
 * intentionally *not* a single "previous folder" slot — that can't survive a
 * round trip (A → B → A → B), whereas a map restores either side. It is also
 * intentionally session-only (in-memory): scroll offsets are ephemeral and
 * don't belong in the persisted preferences bag.
 *
 * Pure (no DOM / store coupling) so it's trivially testable; the caller drives
 * it with two events:
 *   - `record(path, top)` just before a listing fetch starts, while the old
 *     rows are still mounted and `top` (scrollTop) is still readable. This
 *     covers both leaving for another folder AND a same-folder reload (e.g. an
 *     upload finishing), since both re-record the current folder's position.
 *   - `recall(path)` once the new listing is in place — returns the scrollTop to
 *     restore for that folder, or `null` if we have none (→ caller falls back to
 *     its default reveal behavior).
 *
 * `enabled` is a live getter (the user preference). When it returns false the
 * memory is inert: `record` is a no-op and `recall` always returns null.
 */
const DEFAULT_MAX = 50;

export function useFolderScrollMemory(
  enabled: () => boolean,
  opts: { max?: number } = {}
) {
  const max = opts.max ?? DEFAULT_MAX;
  // Insertion order doubles as LRU order: re-recording a path moves it to the
  // end (delete + set), so the first key is always the least-recently-touched.
  const positions = new Map<string, number>();

  const record = (path: string | null | undefined, top: number): void => {
    if (!enabled() || !path) return;
    positions.delete(path);
    positions.set(path, Math.max(0, top));
    while (positions.size > max) {
      const oldest = positions.keys().next().value;
      if (oldest === undefined) break;
      positions.delete(oldest);
    }
  };

  const recall = (path: string | null | undefined): number | null => {
    if (!enabled() || !path) return null;
    const top = positions.get(path);
    return top === undefined ? null : top;
  };

  /** Forget every remembered position. */
  const reset = (): void => {
    positions.clear();
  };

  return { record, recall, reset };
}
