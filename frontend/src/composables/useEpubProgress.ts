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
  /** 4.0 3.3: approximate share read (0..1), for the Continue shelf. */
  pct?: number;
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
    const prev = current[path];
    const next: PositionMap = {
      ...current,
      [path]: { cfi, at: Date.now(), pct: prev?.pct },
    };

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

  /** Record how far through the book the reader is (0..1). Only touches a
   *  book that already has a position, and only on a visible change. */
  const setFraction = (path: string, pct: number) => {
    if (!path || !Number.isFinite(pct)) return;
    const current = prefs.get<PositionMap>(PREF_KEY, {});
    const prev = current[path];
    if (!prev) return;
    const rounded = Math.round(pct * 1000) / 1000;
    if (prev.pct === rounded) return;
    void prefs.set(PREF_KEY, { ...current, [path]: { ...prev, pct: rounded } });
  };

  return { get, set, setFraction };
}
