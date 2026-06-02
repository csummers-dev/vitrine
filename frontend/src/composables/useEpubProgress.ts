/**
 * useEpubProgress — per-book EPUB reading-position memory (v1.3 S5-6).
 *
 * Persists the last-read CFI for each EPUB in `user.Preferences` (so it
 * syncs across devices, same machinery as recents / favorites). Keyed
 * by file path, so reopening a book jumps back to where you left off —
 * unlike the previous single global "book-progress" key, which made
 * every book resume at the last-read position of whatever book you
 * opened most recently.
 *
 * Scope (locked S5-6): last-position auto-resume ONLY. No named
 * bookmark UI — a single CFI per book is all we store.
 *
 * The map is capped at MAX_ENTRIES books, evicting the least-recently
 * updated, so a heavy reader's prefs payload stays bounded.
 */
import { usePreferences } from "@/composables/usePreferences";

const PREF_KEY = "epub.positions";
const MAX_ENTRIES = 100;

/** Stored position. `at` is a unix-ms timestamp used for LRU eviction. */
interface EpubPosition {
  cfi: string | number;
  at: number;
}

type PositionMap = Record<string, EpubPosition>;

export function useEpubProgress() {
  const prefs = usePreferences();

  /** Saved CFI for a book path, or 0 (start of book) when none. */
  const get = (path: string): string | number => {
    if (!path) return 0;
    const map = prefs.get<PositionMap>(PREF_KEY, {});
    return map[path]?.cfi ?? 0;
  };

  /** Upsert the position for a book path, trimming to the
   *  MAX_ENTRIES most-recently-updated books. Debounced + rolled-back
   *  by usePreferences, so frequent relocate events coalesce into one
   *  server write. */
  const set = (path: string, cfi: string | number) => {
    if (!path) return;
    const current = prefs.get<PositionMap>(PREF_KEY, {});
    const next: PositionMap = { ...current, [path]: { cfi, at: Date.now() } };

    const entries = Object.entries(next);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b[1].at - a[1].at);
      const trimmed: PositionMap = {};
      for (const [p, v] of entries.slice(0, MAX_ENTRIES)) trimmed[p] = v;
      void prefs.set(PREF_KEY, trimmed);
    } else {
      void prefs.set(PREF_KEY, next);
    }
  };

  return { get, set };
}
