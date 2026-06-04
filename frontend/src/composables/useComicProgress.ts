/**
 * useComicProgress — per-comic last-read-page memory.
 *
 * Persists the last page index for each CBZ/CBR in `user.Preferences` (so it
 * syncs across devices, the same machinery as recents / favorites / EPUB
 * positions). Keyed by file path, so reopening a comic resumes where you left
 * off. Mirrors useEpubProgress (last-position auto-resume only; the map is
 * capped + LRU-evicted so a heavy reader's prefs payload stays bounded).
 */
import { usePreferences } from "@/composables/usePreferences";

const PREF_KEY = "comic.positions";
const MAX_ENTRIES = 100;

interface ComicPosition {
  page: number;
  at: number; // unix-ms, for LRU eviction
}

type PositionMap = Record<string, ComicPosition>;

export function useComicProgress() {
  const prefs = usePreferences();

  /** Saved page index for a comic path, or 0 (first page) when none. */
  const get = (path: string): number => {
    if (!path) return 0;
    const map = prefs.get<PositionMap>(PREF_KEY, {});
    return map[path]?.page ?? 0;
  };

  /** Upsert the page for a comic path, trimming to the MAX_ENTRIES
   *  most-recently-read comics. Debounced + rolled-back by usePreferences. */
  const set = (path: string, page: number) => {
    if (!path) return;
    const current = prefs.get<PositionMap>(PREF_KEY, {});
    const next: PositionMap = { ...current, [path]: { page, at: Date.now() } };

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
