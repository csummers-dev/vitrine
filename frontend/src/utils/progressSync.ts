/**
 * Keeps the reading / watching progress maps in step with file operations
 * (4.0 Phase 3.3). Called by the files API after a successful rename, move
 * or delete, and by the transfer dock when a move job completes. Accepts
 * either listing URLs (`/files/a%20b.mkv`) or scope paths (`/a b.mkv`).
 *
 * Best effort: without a logged-in user (public shares) it does nothing.
 */
import { usePreferences } from "@/composables/usePreferences";
import { removePrefix } from "@/api/utils";
import { forgetProgress, rekeyProgress } from "@/utils/mediaProgress";

export function toPath(urlOrPath: string): string {
  const bare = urlOrPath.split("?")[0];
  // Listing URLs carry the /files prefix; job paths are already scope paths.
  const stripped = /^\/files(\/|$)/.test(bare) ? removePrefix(bare) : bare;
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
}

function prefs() {
  try {
    return usePreferences();
  } catch {
    return null;
  }
}

export function progressMoved(from: string, to: string): void {
  const p = prefs();
  if (!p) return;
  try {
    rekeyProgress(p, toPath(from), toPath(to));
  } catch {
    /* no user / prefs bag — nothing to keep in sync */
  }
}

export function progressDeleted(urlOrPath: string): void {
  const p = prefs();
  if (!p) return;
  try {
    forgetProgress(p, toPath(urlOrPath));
  } catch {
    /* as above */
  }
}
