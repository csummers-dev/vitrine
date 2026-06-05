/**
 * Resolve which listing rows should be selected after a (re)fetch.
 *
 * Pure mirror of the post-fetch selection logic in `views/Files.vue`. Kept here
 * as a plain function so the intricate branch order — which decides what stays
 * selected across refreshes, transfers, and navigation — is unit-testable
 * without mounting the view.
 *
 * Priority (first match wins):
 *   1. **preselect queue** — explicit post-action targets (e.g. the new copies a
 *      finished transfer produced). If ANY are present in the new listing, select
 *      exactly those. If none are (the action's items landed in a different
 *      folder than the one being viewed), fall through rather than clearing.
 *   2. **same-folder refresh** (`oldPath === newPath`) — restore the prior
 *      selection by path, so a plain refresh (`/`, a settled transfer, an upload)
 *      doesn't drop it. Paths that vanished (deleted / renamed) simply fall out.
 *   3. **navigate-up** (`oldPath` starts with `newPath`) — select the child
 *      folder we just came from.
 *   4. otherwise → nothing.
 *
 * Returns row indices into `items`. Empty before the first load (`oldPath` is
 * `null`) or for a non-directory listing.
 */

export interface SelectableItem {
  /** Decoded, scope-relative path — compared by direct equality. */
  path: string;
}

export interface ResolveSelectionArgs {
  /** Path of the listing being replaced, or `null` on the very first load. */
  oldPath: string | null;
  /** Path of the freshly-fetched listing. */
  newPath: string;
  /** Whether the fresh listing is a directory (selection only applies there). */
  isDir: boolean;
  /** Items of the fresh listing, in display order. */
  items: SelectableItem[];
  /** Paths queued by an action to select after this fetch (decoded). */
  preselect: string[];
  /** Paths that were selected before this fetch (decoded). */
  priorSelection: string[];
}

const indicesOf = (items: SelectableItem[], paths: string[]): number[] => {
  const out: number[] = [];
  for (const p of paths) {
    const idx = items.findIndex((it) => it.path === p);
    if (idx !== -1) out.push(idx);
  }
  return out;
};

export function resolveListingSelection(args: ResolveSelectionArgs): number[] {
  const { oldPath, newPath, isDir, items, preselect, priorSelection } = args;

  // No selection before the first listing, or on a non-directory view.
  if (!isDir || oldPath === null) return [];

  if (preselect.length > 0) {
    const hits = indicesOf(items, preselect);
    // At least one queued item is here → that's the intended post-action
    // selection (e.g. the new copies). If none matched, the items landed in a
    // different folder than the one we're viewing → fall through and keep the
    // existing selection rather than clearing it.
    if (hits.length > 0) return hits;
  }

  // Same-folder refresh: keep the user's selection.
  if (oldPath === newPath) {
    return indicesOf(items, priorSelection);
  }

  // Navigate-up: select the child folder we came from. (Mirrors the original
  // string math exactly; behavior depends on the path's trailing-slash form.)
  if (oldPath.startsWith(newPath)) {
    const name = oldPath.substring(newPath.length).split("/").shift();
    const idx = items.findIndex((it) => it.path === newPath + name);
    return idx !== -1 ? [idx] : [];
  }

  return [];
}
