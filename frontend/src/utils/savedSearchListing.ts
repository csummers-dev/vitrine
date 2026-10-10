/**
 * Runs a saved search and shapes the hits as a folder listing (4.0 Phase
 * 5.3), so results open in the normal listing with thumbnails, selection,
 * the context menu and preview. Each item keeps its real `/files/...` URL,
 * so rename, move, delete and open act on the actual file; the listing
 * itself is read-only (nothing can be created "in" a search).
 */
import { tags as tagsApi } from "@/api";
import { encodePath } from "@/utils/url";
import {
  parseQuery,
  buildSearchParams,
  type ParsedQuery,
} from "@/utils/searchQuery";
import {
  normalizeFolder,
  type SavedSearch,
} from "@/composables/useSavedSearches";

/** Most hits a saved search lists; the header says when there are more. */
export const SAVED_SEARCH_RESULT_CAP = 5000;

/** Tag names in the query that don't exist. A search for a missing tag
 *  matches nothing (rather than silently dropping the filter). */
export function unknownTags(
  parsed: ParsedQuery,
  nameToId: Record<string, number>
): string[] {
  return parsed.tags.filter((t) => nameToId[t.toLowerCase()] === undefined);
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i) : "";
}

/** Shape search hits as a listing Resource for the saved search. */
export function toListing(
  saved: SavedSearch,
  hits: RecursiveEntry[],
  sorting: Sorting
): Resource {
  const folder = normalizeFolder(saved.folder);
  const shown = hits.slice(0, SAVED_SEARCH_RESULT_CAP);
  const items: ResourceItem[] = shown.map((h, index) => ({
    path: h.path,
    name: h.name,
    size: h.size,
    extension: h.isDir ? "" : extensionOf(h.name),
    modified: h.modified,
    mode: 0,
    isDir: h.isDir,
    isSymlink: false,
    type: h.type ?? (h.isDir ? "dir" : "blob"),
    url: `/files${encodePath(h.path)}${h.isDir ? "/" : ""}`,
    index,
  }));
  const numDirs = items.filter((i) => i.isDir).length;
  return {
    path: folder,
    name: saved.name,
    size: 0,
    extension: "",
    modified: "",
    mode: 0,
    isDir: true,
    isSymlink: false,
    type: "dir",
    url: folder === "/" ? "/files/" : `/files${encodePath(folder)}/`,
    items,
    numDirs,
    numFiles: items.length - numDirs,
    sorting,
    index: 0,
    savedSearch: { ...saved, folder, total: hits.length },
  };
}

/** Run `saved` and return its results as a listing. */
export async function runSavedSearch(
  saved: SavedSearch,
  deps: {
    nameToId: Record<string, number>;
    sorting: Sorting;
    signal?: AbortSignal;
    now?: number;
  }
): Promise<Resource> {
  const parsed = parseQuery(saved.query);
  if (unknownTags(parsed, deps.nameToId).length > 0) {
    return toListing(saved, [], deps.sorting);
  }
  const folder = normalizeFolder(saved.folder);
  const params = buildSearchParams(parsed, deps.nameToId, deps.now);
  const hits = await tagsApi.searchRecursive(
    `/files${encodePath(folder)}`,
    params,
    deps.signal
  );
  return toListing(saved, hits, deps.sorting);
}
