/**
 * Sort helpers for the move/copy folder picker (v2.8).
 *
 * Extracted from FolderPicker.vue so the ordering rules — the one bit with
 * real correctness stakes — are unit-tested in one place, and the component
 * just renders the result.
 */

export type PickerSortBy = "name" | "modified";

/** The minimal shape the picker sorts. */
export interface SortableFolder {
  name: string;
  /** RFC3339 string, or "" when unknown. */
  modified: string;
}

/**
 * A NEW array of folders ordered by `by` in the given direction. The input is
 * not mutated. Name uses a numeric, case-insensitive locale compare (so
 * "folder2" < "folder10" and case doesn't split the list); modified compares
 * parsed timestamps, with unknown/empty dates treated as epoch 0 so they sink
 * to the bottom of a newest-first list rather than scattering.
 */
export function sortFolders<T extends SortableFolder>(
  folders: readonly T[],
  by: PickerSortBy,
  asc: boolean
): T[] {
  const list = [...folders];
  list.sort((a, b) => {
    let c: number;
    if (by === "modified") {
      const ta = Date.parse(a.modified || "") || 0;
      const tb = Date.parse(b.modified || "") || 0;
      c = ta - tb;
      // Tie-break equal (or both-unknown) dates by name so the order is stable
      // and predictable rather than dependent on the incoming server order.
      if (c === 0) {
        c = a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
    } else {
      c = a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }
    return asc ? c : -c;
  });
  return list;
}

/** The compact label shown on the sort trigger + used for its title/aria. */
export function pickerSortLabel(by: PickerSortBy, asc: boolean): string {
  const field = by === "modified" ? "Modified" : "Name";
  const dir =
    by === "modified" ? (asc ? "Oldest" : "Newest") : asc ? "A→Z" : "Z→A";
  return `${field}, ${dir}`;
}

/** Coerce a persisted prefs value into a valid {by, asc}. Default: Name, A→Z. */
export function readPickerSort(raw: { by?: string; asc?: boolean } | null): {
  by: PickerSortBy;
  asc: boolean;
} {
  return {
    by: raw?.by === "modified" ? "modified" : "name",
    asc: raw?.asc !== false,
  };
}
