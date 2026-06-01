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

  return { favorites, isFavorited, add, remove, toggle };
}
