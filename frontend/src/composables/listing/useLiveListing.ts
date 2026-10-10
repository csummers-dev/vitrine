/**
 * Live listings (4.0 Phase 2.3): when the server reports that a folder on
 * screen changed — through vitrine, a downloader, SMB or the host shell — ask
 * for a silent refresh. Files.vue's reload gate already keeps the selection
 * and scroll position and defers while the user is mid-action (rename, open
 * panel, drag).
 *
 * Bursts are debounced per pane, so a folder filling up during a download
 * refreshes a few times rather than on every file.
 */
import { onScopeDispose } from "vue";
import type { EventStream } from "@/api/stream";
import { useServerEvents } from "@/composables/useServerEvents";

export const LIVE_REFRESH_DEBOUNCE_MS = 300;

export interface LiveListingDeps {
  /** Scope-relative folder shown in the main pane ("/Movies"), or null. */
  currentDir: () => string | null;
  /** Folder shown in the second pane when split view is open, or null. */
  paneBDir: () => string | null;
  refreshCurrent: () => void;
  refreshPaneB: () => void;
  stream?: EventStream;
}

/** "/Movies/" and "Movies" both become "/Movies"; the root is "/". */
export function normalizeDir(dir: string): string {
  const trimmed = ("/" + dir).replace(/\/+/g, "/").replace(/\/$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** A pane's route URL ("/files/My%20Movies/") as a scope-relative folder. */
export function dirFromFilesUrl(url: string): string | null {
  if (!url.startsWith("/files")) return null;
  try {
    return normalizeDir(decodeURIComponent(url.slice("/files".length)));
  } catch {
    return null;
  }
}

export function useLiveListing(deps: LiveListingDeps) {
  const timers: Record<"a" | "b", ReturnType<typeof setTimeout> | null> = {
    a: null,
    b: null,
  };

  const schedule = (pane: "a" | "b", run: () => void) => {
    if (timers[pane] !== null) return;
    timers[pane] = setTimeout(() => {
      timers[pane] = null;
      run();
    }, LIVE_REFRESH_DEBOUNCE_MS);
  };

  const onChange = ({ dir }: { dir: string }) => {
    const changed = normalizeDir(dir);
    const current = deps.currentDir();
    if (current !== null && normalizeDir(current) === changed) {
      schedule("a", deps.refreshCurrent);
    }
    const paneB = deps.paneBDir();
    if (paneB !== null && normalizeDir(paneB) === changed) {
      schedule("b", deps.refreshPaneB);
    }
  };

  useServerEvents("files.changed", onChange, deps.stream);

  onScopeDispose(() => {
    for (const k of ["a", "b"] as const) {
      if (timers[k] !== null) clearTimeout(timers[k]);
      timers[k] = null;
    }
  });

  return { onChange };
}
