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

export function useFavorites() {
  const prefs = usePreferences();

  /** Reactive list of favorited folder paths. Insertion order. */
  const favorites = computed<string[]>(() => prefs.get<string[]>(PREF_KEY, []));

  /** Check membership. Used by the star icon to pick filled vs outline. */
  const isFavorited = (path: string): boolean => favorites.value.includes(path);

  /** Idempotent add — no-op if already present. */
  const add = (path: string) => {
    const current = prefs.get<string[]>(PREF_KEY, []);
    if (current.includes(path)) return;
    void prefs.set(PREF_KEY, [...current, path]);
  };

  /** Idempotent remove — no-op if absent. */
  const remove = (path: string) => {
    const current = prefs.get<string[]>(PREF_KEY, []);
    if (!current.includes(path)) return;
    void prefs.set(
      PREF_KEY,
      current.filter((p) => p !== path)
    );
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

  return { favorites, isFavorited, add, remove, toggle, reorder, insert };
}
