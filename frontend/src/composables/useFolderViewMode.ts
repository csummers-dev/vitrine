/**
 * useFolderViewMode — per-folder view-mode override (v1.3 S3-3).
 *
 * Persists in localStorage (per-device, NOT cross-device — the locked
 * Stage 3 decision). Falls back to `authStore.user.viewMode` global
 * default when no per-folder entry exists.
 *
 * Why localStorage rather than server-side prefs (S1-2):
 *   - View mode is fundamentally device-shaped — a phone wants list,
 *     a 27" monitor might want grid. Syncing across devices would
 *     surprise users.
 *   - Read is hot-path (every listing render); avoiding a server
 *     round-trip + the prefs composable's reactivity layer keeps the
 *     listing render fast.
 *
 * Storage key: a single JSON object under `fb:folderViewMode` mapping
 * `folderUrl → ViewModeType`. Bounded growth in practice — typical
 * users have <100 folders they actively browse, so the payload stays
 * tiny.
 *
 * Map shape (vs N independent keys): one read on mount, one write on
 * change. Easier to clear ("forget all my folder preferences" =
 * `localStorage.removeItem`) and to inspect in DevTools.
 */
import { useAuthStore } from "@/stores/auth";

const STORAGE_KEY = "fb:folderViewMode";

type FolderViewModeMap = Record<string, ViewModeType>;

/** Read the full map from localStorage. Returns {} on parse failure
 *  rather than throwing — a corrupted entry shouldn't break navigation. */
function readMap(): FolderViewModeMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as FolderViewModeMap;
  } catch {
    return {};
  }
}

/** Write the full map back. Silently swallows quota errors — view-mode
 *  memory is a UX nicety, not core functionality. */
function writeMap(map: FolderViewModeMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded / private-browsing restriction. Not worth a
    // toast — the user can still navigate normally.
  }
}

export function useFolderViewMode() {
  const authStore = useAuthStore();

  /** Resolve the view mode for a given folder URL. Per-folder override
   *  if present; otherwise fall back to the user's global default. */
  const getModeForPath = (path: string): ViewModeType => {
    const map = readMap();
    return map[path] ?? authStore.user?.viewMode ?? "list";
  };

  /** Set the per-folder override. Does NOT touch the user's global
   *  default — that's only changed via Profile settings (or wherever
   *  the user explicitly says "this is my default"). */
  const setModeForPath = (path: string, mode: ViewModeType): void => {
    const map = readMap();
    map[path] = mode;
    writeMap(map);
  };

  /** Remove the per-folder override (revert this folder to using the
   *  global default). Future "Reset to default" UI hook. */
  const clearModeForPath = (path: string): void => {
    const map = readMap();
    if (!(path in map)) return;
    delete map[path];
    writeMap(map);
  };

  /** Wipe every override. "Forget all my folder preferences" hook. */
  const clearAll = (): void => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // No-op — see writeMap.
    }
  };

  return { getModeForPath, setModeForPath, clearModeForPath, clearAll };
}
