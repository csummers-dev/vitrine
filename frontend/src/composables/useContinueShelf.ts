/**
 * useContinueShelf — the sidebar's "Continue" list (4.0 Phase 3.3): books,
 * comics and videos that were started but not finished, most recent first.
 * Built from the epub / comic / video progress maps in user preferences, so
 * it follows the user across devices and updates as they read or watch.
 */
import { computed } from "vue";
import { usePreferences } from "@/composables/usePreferences";
import {
  continueItems,
  PROGRESS_KEYS,
  type ContinueItem,
} from "@/utils/mediaProgress";

export const SHELF_SIZE = 6;

export function useContinueShelf(limit = SHELF_SIZE) {
  const prefs = usePreferences();

  const items = computed<ContinueItem[]>(() => continueItems(prefs, limit));

  /** Take an item off the shelf by forgetting its saved position. */
  const remove = (item: ContinueItem) => {
    const key = PROGRESS_KEYS[item.kind];
    const map = prefs.get<Record<string, unknown>>(key, {});
    if (!(item.path in map)) return;
    const next = { ...map };
    delete next[item.path];
    void prefs.set(key, next);
  };

  /** Mark an item finished: it leaves the shelf but keeps its state (a
   *  video shows as watched). */
  const markFinished = (item: ContinueItem) => {
    const key = PROGRESS_KEYS[item.kind];
    const map = prefs.get<Record<string, Record<string, unknown>>>(key, {});
    const cur = map[item.path];
    if (!cur) return;
    let done: Record<string, unknown>;
    if (item.kind === "video") done = { ...cur, t: 0, watched: true };
    else if (item.kind === "epub") done = { ...cur, pct: 1 };
    else {
      const total = Number(cur.total) || 0;
      done = total > 0 ? { ...cur, page: total - 1 } : { ...cur, page: 0 };
    }
    void prefs.set(key, { ...map, [item.path]: { ...done, at: Date.now() } });
  };

  return { items, remove, markFinished };
}

export const SHELF_ICONS: Record<ContinueItem["kind"], string> = {
  epub: "book-open",
  comic: "book-image",
  video: "film",
};
