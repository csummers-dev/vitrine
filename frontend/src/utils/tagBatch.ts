/**
 * Pure helpers for the multi-select tag picker's tri-state logic (2.4.0 Stage 5
 * / K). Kept out of the component so the (fiddly) set math is unit-testable.
 */

export interface TagTriState {
  /** Tag ids present on EVERY selected path → checkbox checked. */
  all: Set<number>;
  /** Tag ids present on SOME but not all → checkbox indeterminate. */
  some: Set<number>;
}

/**
 * Build the initial tri-state from each path's tag-id list. A tag on all N paths
 * is "all" (checked); a tag on 1..N-1 is "some" (indeterminate); a tag on none
 * simply doesn't appear. Duplicate ids within one path are ignored.
 */
export function tagTriState(perPath: number[][]): TagTriState {
  const total = perPath.length;
  const counts = new Map<number, number>();
  for (const ids of perPath) {
    for (const id of new Set(ids)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const all = new Set<number>();
  const some = new Set<number>();
  for (const [id, n] of counts) {
    if (total > 0 && n >= total) all.add(id);
    else some.add(id);
  }
  return { all, some };
}

/**
 * The add/remove delta to apply across all paths, given the initial tri-state
 * and the final checkbox state (checked + still-indeterminate sets):
 *   - ADD a tag now checked that wasn't already on every path;
 *   - REMOVE a tag that was present (all or some) but is now neither checked nor
 *     left indeterminate;
 *   - a tag left indeterminate (untouched) yields no change.
 */
export function tagBatchDelta(
  initialAll: Set<number>,
  initialSome: Set<number>,
  checked: Set<number>,
  indeterminate: Set<number>
): { add: number[]; remove: number[] } {
  const add: number[] = [];
  for (const id of checked) {
    if (!initialAll.has(id)) add.push(id);
  }
  const remove: number[] = [];
  for (const id of new Set<number>([...initialAll, ...initialSome])) {
    if (!checked.has(id) && !indeterminate.has(id)) remove.push(id);
  }
  return { add, remove };
}
