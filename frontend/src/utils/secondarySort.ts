/**
 * Apply a secondary sort criterion as a tiebreaker over an already-
 * primary-sorted item list (v1.3 S3-4).
 *
 * The server sorts by the primary axis and returns the items in that
 * order. To honor multi-column sort semantics ("by Size desc, then by
 * Modified desc"), we walk the list, find groups of items that have
 * identical primary values, and sort just those groups by the
 * secondary axis. Primary order is preserved exactly; only ties
 * within the primary key get rearranged.
 *
 * Why this approach instead of a full client-side re-sort:
 *   - Preserves the server's primary ordering byte-for-byte. No risk
 *     of subtle JS-vs-Go comparator drift (e.g., Go's natural.Less
 *     handles "file_2" vs "file_10" differently than JS's default
 *     string compare).
 *   - O(N log K) where K is the typical tie-group size (often 1, so
 *     effectively O(N)).
 *
 * No-op when secondary is null or when the secondary key equals the
 * primary (every primary tie is also a secondary tie — sort would be
 * meaningless).
 */

/** Extract the comparable value for a given sort key. */
function primaryKey(item: ResourceItem, by: SortKey): string | number {
  switch (by) {
    case "name":
      return item.name;
    case "size":
      return item.size;
    case "modified":
      return item.modified;
    case "extension":
      return item.extension;
  }
}

/** Comparator producing -1/0/1 for two items by the given sort key. */
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
      // Modified is an ISO 8601 string. Date.parse is safer than
      // string compare for ISO inputs but both work; Date.parse
      // matches the user's "time-based" mental model.
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
 * Return a new array with the secondary sort applied as a tiebreaker.
 * Input array is not mutated.
 */
export function applySecondarySort(
  items: ResourceItem[],
  primaryBy: SortKey,
  secondary: SortCriterion | null
): ResourceItem[] {
  if (!secondary) return items;
  // Same-key secondary is a no-op tiebreaker (sortMenuItems should
  // disable this combo in the UI, but defend in code too).
  if (secondary.by === primaryBy) return items;
  if (items.length < 2) return items;

  const result = [...items];
  let i = 0;
  while (i < result.length) {
    const key = primaryKey(result[i], primaryBy);
    // Find the end of the current run of items with equal primary key.
    let j = i + 1;
    while (j < result.length && primaryKey(result[j], primaryBy) === key) {
      j++;
    }
    if (j - i > 1) {
      // Stable sort within the tie-group on secondary.
      const group = result.slice(i, j).sort((a, b) => {
        const c = compareBy(a, b, secondary.by);
        return secondary.asc ? c : -c;
      });
      for (let k = 0; k < group.length; k++) {
        result[i + k] = group[k];
      }
    }
    i = j;
  }
  return result;
}
