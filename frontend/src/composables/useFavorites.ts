/**
 * useFavorites — pinned-folder shortcuts (v1.3 S3-2).
 *
 * Persisted via `usePreferences` under the key `favorites` as a
 * `string[]` of folder paths. Insertion order is sidebar render order;
 * drag-to-reorder is deferred to v1.4.
 *
 * Locked Stage 3 decision: FOLDERS ONLY. Files belong in the Recents
 * log (S3-1), which captures "what was I working on"; favorites
 * captures "where do I want to jump to fast". Different lists, different
 * mental models — mixing them would muddy both.
 *
 * Two affordances surface the toggle:
 *   - Hover-visible star on folder rows (ListingItem.vue)
 *   - Always-visible star on the section-title eyebrow for the
 *     currently-open folder (FileListing.vue)
 *
 * Both call `toggle(path)` here. Filled vs outline star is computed
 * from `isFavorited(path)`.
 */
import { computed } from "vue";
import { usePreferences } from "@/composables/usePreferences";

const PREF_KEY = "favorites";
/**
 * Custom per-favorite sidebar display names. Stored SEPARATELY from the
 * ordered `favorites` array as a `Record<path, title>` map so the title is
 * a pure presentation alias — it never reorders or duplicates the pin list,
 * and it touches nothing on the real folder (rename-free). A path with no
 * entry (or a blank one) falls back to the folder's basename. Only ever
 * surfaced in the sidebar Favorites section.
 */
const TITLES_KEY = "favoriteTitles";

export function useFavorites() {
  const prefs = usePreferences();

  /** Reactive list of favorited folder paths. Insertion order. */
  const favorites = computed<string[]>(() => prefs.get<string[]>(PREF_KEY, []));

  /** Reactive map of path → custom display title. */
  const titles = computed<Record<string, string>>(() =>
    prefs.get<Record<string, string>>(TITLES_KEY, {})
  );

  /** Check membership. Used by the star icon to pick filled vs outline. */
  const isFavorited = (path: string): boolean => favorites.value.includes(path);

  /** basename of a folder path, URL-decoded.
   *  "/files/Documents/Letters/" → "Letters". The default sidebar label. */
  const baseName = (path: string): string => {
    const trimmed = String(path).replace(/\/+$/, "");
    const segments = trimmed.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? path;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  };

  /** The raw custom title set for a path, or "" when none. Use this to
   *  pre-fill the edit input (so the field shows what's actually stored,
   *  not the basename fallback). */
  const titleFor = (path: string): string => titles.value[path] ?? "";

  /** The label to RENDER in the sidebar: the custom title when set + non-blank,
   *  otherwise the folder's basename. */
  const displayName = (path: string): string => {
    const t = (titles.value[path] ?? "").trim();
    return t.length > 0 ? t : baseName(path);
  };

  /** Set (or clear, when blank/whitespace) the custom sidebar title for a
   *  favorite. Purely a display alias — the underlying folder is untouched. */
  const setTitle = (path: string, title: string) => {
    const current = prefs.get<Record<string, string>>(TITLES_KEY, {});
    const next = { ...current };
    const trimmed = title.trim();
    if (trimmed.length > 0) {
      next[path] = trimmed;
    } else {
      delete next[path];
    }
    void prefs.set(TITLES_KEY, next);
  };

  /** Idempotent add — no-op if already present. */
  const add = (path: string) => {
    const current = prefs.get<string[]>(PREF_KEY, []);
    if (current.includes(path)) return;
    void prefs.set(PREF_KEY, [...current, path]);
  };

  /** Idempotent remove — no-op if absent. Also drops any custom display
   *  title, which is meaningless once the folder is no longer pinned. Both
   *  writes coalesce into a single debounced PUT (usePreferences batches). */
  const remove = (path: string) => {
    const current = prefs.get<string[]>(PREF_KEY, []);
    if (!current.includes(path)) return;
    void prefs.set(
      PREF_KEY,
      current.filter((p) => p !== path)
    );
    const t = prefs.get<Record<string, string>>(TITLES_KEY, {});
    if (path in t) {
      const next = { ...t };
      delete next[path];
      void prefs.set(TITLES_KEY, next);
    }
  };

  /** Toggle membership — the canonical action for star-button clicks. */
  const toggle = (path: string) => {
    if (isFavorited(path)) {
      remove(path);
    } else {
      add(path);
    }
  };

  /** Move a favorite from one position to another (drag-to-reorder,
   *  RC-25). Persists the new order. No-op for out-of-range or identical
   *  indices. */
  const reorder = (fromIndex: number, toIndex: number) => {
    const current = prefs.get<string[]>(PREF_KEY, []);
    if (fromIndex < 0 || fromIndex >= current.length) return;
    if (toIndex < 0 || toIndex >= current.length) return;
    if (fromIndex === toIndex) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    void prefs.set(PREF_KEY, next);
  };

  /** Rewrite favorites (and their custom titles) when a folder is renamed or
   *  moved, so the pin follows the folder instead of breaking. Updates the
   *  exact match AND any descendants (a renamed parent shifts every child's
   *  path). `from`/`to` are the `/files/...`-prefixed, URL-encoded forms — the
   *  same strings the listing builds for `item.url`, so an exact-match holds.
   *  No-op when nothing references the moved path. */
  const renamePath = (from: string, to: string) => {
    if (!from || !to || from === to) return;
    // Compare on a trailing-slash-insensitive base: a current-folder url often
    // carries a trailing "/" while child `item.url`s don't, so without this a
    // favorited SUBFOLDER wouldn't be recognised as a descendant of a renamed
    // parent. Exact matches keep the caller's `to` (the precise new url); the
    // descendant suffix is appended to the slash-stripped `to`.
    const stripTrail = (s: string): string =>
      s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
    const fromBase = stripTrail(from);
    const toBase = stripTrail(to);
    const remap = (p: string): string | null => {
      const pb = stripTrail(p);
      if (pb === fromBase) return to;
      if (pb.startsWith(fromBase + "/"))
        return toBase + pb.slice(fromBase.length);
      return null;
    };

    const currentFavs = prefs.get<string[]>(PREF_KEY, []);
    let favsChanged = false;
    const nextFavs = currentFavs.map((p) => {
      const r = remap(p);
      if (r !== null) {
        favsChanged = true;
        return r;
      }
      return p;
    });
    if (favsChanged) void prefs.set(PREF_KEY, nextFavs);

    const currentTitles = prefs.get<Record<string, string>>(TITLES_KEY, {});
    let titlesChanged = false;
    const nextTitles: Record<string, string> = {};
    for (const [k, v] of Object.entries(currentTitles)) {
      const r = remap(k);
      if (r !== null) {
        titlesChanged = true;
        nextTitles[r] = v;
      } else {
        nextTitles[k] = v;
      }
    }
    if (titlesChanged) void prefs.set(TITLES_KEY, nextTitles);
  };

  /** Insert a favorite at a specific position. Used to restore the exact
   *  prior order after an undo (RC-34). No-op if already present; the index
   *  is clamped to [0, length]. */
  const insert = (path: string, index: number) => {
    const current = prefs.get<string[]>(PREF_KEY, []);
    if (current.includes(path)) return;
    const next = [...current];
    const i = Math.max(0, Math.min(index, next.length));
    next.splice(i, 0, path);
    void prefs.set(PREF_KEY, next);
  };

  return {
    favorites,
    titles,
    isFavorited,
    displayName,
    titleFor,
    setTitle,
    add,
    remove,
    toggle,
    reorder,
    insert,
    renamePath,
  };
}
