/**
 * Client-side listing sort (2.4.x).
 *
 * The listing's displayed order is decided HERE, on the client, so a sort
 * change is reflected instantly — the moment the user picks a field or flips
 * direction — instead of waiting on a server round-trip + silent reload. The
 * server still persists the primary sort (so it's the order on the next fresh
 * load) and sorts the initial payload, but the rendered order is this
 * function's. That means:
 *
 *   - Changing the primary sort re-orders the listing immediately.
 *   - A "None" secondary truly means none — no hidden tiebreaker survives.
 *
 * Called once per group (dirs and files render separately, dirs first), so
 * each group sorts in isolation and the dirs-first grouping is never
 * disturbed. Sorting copies (never `req.items` itself), so each item keeps its
 * original `index` — selection / keyboard-nav still map back correctly.
 *
 * Native Array.prototype.sort is stable (ES2019+), so two items equal on BOTH
 * criteria keep their incoming (server) order as the final tiebreaker.
 *
 * Comparator note: name / extension use localeCompare(numeric) — a close match
 * to the Go backend's natural.Less ("file_2" before "file_10"), and already
 * the comparator this codebase shipped for the secondary axis.
 */

/** Comparator producing -1/0/1 for two items by the given sort key (ascending). */
function compareBy(a: ResourceItem, b: ResourceItem, by: SortKey): number {
  switch (by) {
    case "name":
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    case "size":
      return a.size - b.size;
    case "modified": {
      // Modified is an ISO 8601 string. Date.parse matches the user's
      // "time-based" mental model and is safe for ISO inputs.
      const aT = Date.parse(a.modified);
      const bT = Date.parse(b.modified);
      return aT - bT;
    }
    case "extension":
      return a.extension.localeCompare(b.extension, undefined, {
        sensitivity: "base",
      });
  }
}

/**
 * Return a NEW array sorted by `primary`, breaking ties with `secondary`
 * (only when it's set and names a different key). The input array is not
 * mutated; arrays shorter than two items are returned as-is.
 */
export function sortListing(
  items: ResourceItem[],
  primary: SortCriterion,
  secondary: SortCriterion | null
): ResourceItem[] {
  if (items.length < 2) return items;

  // A secondary that repeats the primary key is a no-op tiebreaker (every
  // primary tie is also a secondary tie). The sort menu already disables that
  // combo; defend here too.
  const sec = secondary && secondary.by !== primary.by ? secondary : null;

  const sorted = [...items];
  sorted.sort((a, b) => {
    const p = compareBy(a, b, primary.by);
    if (p !== 0) return primary.asc ? p : -p;
    if (sec) {
      const s = compareBy(a, b, sec.by);
      if (s !== 0) return sec.asc ? s : -s;
    }
    // Equal on every active criterion — return 0 so the stable sort keeps
    // the incoming (server) order.
    return 0;
  });
  return sorted;
}
