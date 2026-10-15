/**
 * useRecents — MRU log of recently-viewed files (v1.3 S3-1).
 *
 * Persisted via `usePreferences` under the key `recents`. Files only
 * (folder navigation is intentionally NOT tracked — the locked Stage 3
 * decision is that the recents list should surface things the user
 * actually consumed, not the breadcrumb path they walked through).
 *
 * MRU semantics: re-tracking an existing path moves it to the front
 * of the list rather than appending a duplicate. Cap at 50 — long
 * enough to be useful as a "what was I working on" log, short enough
 * to bound the prefs payload size.
 *
 * Persistence is server-side via the Stage 1 prefs composable, so
 * recents sync across devices automatically with optimistic +
 * debounced + rollback semantics.
 */
import { computed } from "vue";
import { usePreferences } from "@/composables/usePreferences";

const PREF_KEY = "recents";
const MAX_RECENTS = 50;

/**
 * One row in the recents log. Lean shape — sidebar + palette only
 * need name/path to render; icon comes from filename extension; type
 * isn't tracked because we'd have to re-fetch metadata to render a
 * proper preview icon and that defeats the lightweight-log purpose.
 */
export interface RecentEntry {
  /** Full server-side path, e.g. "/Documents/draft.pdf". */
  path: string;
  /** Basename, e.g. "draft.pdf". Decoded. */
  name: string;
  /** True for directories. Always false in v1.3 (we only track file
   *  preview opens) but the field is here for forward compatibility
   *  in case the trigger set expands. */
  isDir: boolean;
  /** Unix ms timestamp. Sortable; used for "Last opened 5m ago" if
   *  we add relative timestamps to the row later. */
  accessedAt: number;
}

export function useRecents() {
  const prefs = usePreferences();

  /** Reactive read of the list. Defaults to [] when the user has no
   *  history yet. */
  const recents = computed<RecentEntry[]>(() =>
    prefs.get<RecentEntry[]>(PREF_KEY, [])
  );

  /**
   * Record an access. Promotes existing entries to the front (MRU
   * dedup) rather than appending duplicates. Caps the list at
   * MAX_RECENTS by trimming the oldest.
   *
   * Safe to call frequently — `usePreferences().set()` debounces the
   * server PUT, so a fast sequence of opens (e.g., page through 10
   * images in a row) only generates one network request.
   */
  const track = (entry: Omit<RecentEntry, "accessedAt">) => {
    const now = Date.now();
    const current = prefs.get<RecentEntry[]>(PREF_KEY, []);
    // Drop any existing entry for this path so the new one floats
    // to the front (MRU promotion).
    const filtered = current.filter((r) => r.path !== entry.path);
    const next: RecentEntry[] = [
      { ...entry, accessedAt: now },
      ...filtered,
    ].slice(0, MAX_RECENTS);
    void prefs.set(PREF_KEY, next);
  };

  /** Empty the recents log. Used by an explicit "Clear recents" UI
   *  affordance (Profile settings, future). */
  const clear = () => {
    void prefs.set(PREF_KEY, []);
  };

  /** Remove a single entry by path. Used by the per-row "Remove from
   *  recents" affordance (if/when added). */
  const remove = (path: string) => {
    const current = prefs.get<RecentEntry[]>(PREF_KEY, []);
    void prefs.set(
      PREF_KEY,
      current.filter((r) => r.path !== path)
    );
  };

  /** Follow a rename or move made in the app: `from`/`to` are server paths
   *  (decoded, no /files prefix). A folder moves every recent file under it. */
  const renamePath = (from: string, to: string) => {
    if (!from || !to || from === to) return;
    const strip = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
    const f = strip(from);
    const t = strip(to);
    let changed = false;
    const next = prefs.get<RecentEntry[]>(PREF_KEY, []).map((r) => {
      if (r.path === f) {
        changed = true;
        return { ...r, path: t, name: t.slice(t.lastIndexOf("/") + 1) };
      }
      if (r.path.startsWith(f + "/")) {
        changed = true;
        return { ...r, path: t + r.path.slice(f.length) };
      }
      return r;
    });
    if (changed) void prefs.set(PREF_KEY, next);
  };

  /** Drop entries (and anything under them) that no longer exist. */
  const removeMany = (paths: string[]) => {
    if (!paths.length) return;
    const gone = new Set(paths);
    const current = prefs.get<RecentEntry[]>(PREF_KEY, []);
    const next = current.filter((r) => !gone.has(r.path));
    if (next.length !== current.length) void prefs.set(PREF_KEY, next);
  };

  return { recents, track, clear, remove, renamePath, removeMany };
}
