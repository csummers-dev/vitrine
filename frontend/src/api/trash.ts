/**
 * Trash / recycle bin API client (2.4.0 Stage 2). Deletes land here via
 * `files.remove()` (which returns the new entry's `trashId`); this module
 * lists, restores, and permanently removes entries. All paths are
 * user-relative — the backend translates to the per-volume `.trash` dirs.
 */
import { fetchJSON, fetchURL } from "./utils";

export interface TrashEntry {
  id: string;
  name: string;
  /** Where the item lived before deletion, e.g. "/Movies/a.txt". */
  originalPath: string;
  /** originalPath's parent folder, for display. */
  originalDir: string;
  isDir: boolean;
  size: number;
  /** RFC3339. */
  trashedAt: string;
  /** Username that deleted the item. */
  user: string;
}

/** All trash entries in the user's scope, newest first. */
export async function list(): Promise<TrashEntry[]> {
  return fetchJSON<TrashEntry[]>("/api/trash", {});
}

/**
 * Restore an entry to its original location (suffixed "(N)" if the name has
 * been taken since). Resolves with the user-relative restored path.
 */
export async function restore(id: string): Promise<string> {
  const res = await fetchJSON<{ path: string }>(
    `/api/trash/${encodeURIComponent(id)}`,
    { method: "POST" }
  );
  return res.path;
}

/** Permanently delete one entry. */
export async function deleteForever(id: string): Promise<void> {
  await fetchURL(`/api/trash/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Permanently delete every entry in the user's scope. */
export async function empty(): Promise<void> {
  await fetchURL("/api/trash", { method: "DELETE" });
}
