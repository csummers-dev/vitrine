/**
 * Choosing which duplicates to delete (4.0 Phase 5.2). The one rule that
 * always holds: at least one copy in every group stays unselected, however
 * the selection was made.
 */
import type { DupeCopy, DupeGroup } from "@/api/dupes";

export type KeepRule = "newest" | "oldest" | "folder";

const time = (c: DupeCopy) => Date.parse(c.modified) || 0;

/** The copy a rule keeps when it keeps exactly one. Ties go to the
 *  shortest, then alphabetically first, path. */
function pick(files: DupeCopy[], newest: boolean): DupeCopy {
  return [...files].sort((a, b) => {
    const d = newest ? time(b) - time(a) : time(a) - time(b);
    if (d !== 0) return d;
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    return a.path < b.path ? -1 : 1;
  })[0];
}

const inside = (p: string, folder: string) => {
  const f = folder.replace(/\/+$/, "");
  return f === "" || p.startsWith(f + "/");
};

/**
 * Select every copy except the ones the rule keeps. With "folder", copies
 * inside `folder` are kept; a group with no copy there (or only copies
 * there) is left alone rather than losing every copy.
 */
export function autoSelect(
  groups: DupeGroup[],
  rule: KeepRule,
  folder = ""
): Set<string> {
  const out = new Set<string>();
  for (const g of groups) {
    if (g.files.length < 2) continue;
    let keep: Set<string>;
    if (rule === "folder") {
      const there = g.files.filter((f) => inside(f.path, folder));
      if (there.length === 0 || there.length === g.files.length) continue;
      keep = new Set(there.map((f) => f.path));
    } else {
      keep = new Set([pick(g.files, rule === "newest").path]);
    }
    for (const f of g.files) if (!keep.has(f.path)) out.add(f.path);
  }
  return out;
}

/** Whether `path` may be selected without selecting its whole group. */
export function canSelect(
  group: DupeGroup,
  selected: Set<string>,
  path: string
): boolean {
  if (selected.has(path)) return true;
  const left = group.files.filter((f) => !selected.has(f.path)).length;
  return left > 1;
}

/** Toggle one copy, refusing to select the last unselected copy. Returns
 *  the new selection, or null when refused. */
export function toggleCopy(
  group: DupeGroup,
  selected: Set<string>,
  path: string
): Set<string> | null {
  const next = new Set(selected);
  if (next.has(path)) {
    next.delete(path);
    return next;
  }
  if (!canSelect(group, selected, path)) return null;
  next.add(path);
  return next;
}

/** Bytes freed by deleting the selection. */
export function selectedBytes(
  groups: DupeGroup[],
  selected: Set<string>
): number {
  let n = 0;
  for (const g of groups) {
    for (const f of g.files) if (selected.has(f.path)) n += g.size;
  }
  return n;
}

/** Drop selected paths that are no longer in any group. */
export function keepKnown(
  groups: DupeGroup[],
  selected: Set<string>
): Set<string> {
  const known = new Set(groups.flatMap((g) => g.files.map((f) => f.path)));
  return new Set([...selected].filter((p) => known.has(p)));
}
