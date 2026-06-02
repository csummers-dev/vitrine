/**
 * searchSmart — query-parse-aware search dispatcher (v1.3 S2-7).
 *
 * Wraps two backends behind a single callback-shaped interface so both
 * the command palette and the header Search.vue can swap their direct
 * `search()` call for this one without restructuring their accumulator
 * logic:
 *
 *   - When the parsed query carries structured filters (tag: / ext:),
 *     hit the new `/api/search/recursive` endpoint (S2-4). One JSON
 *     response, iterated through the callback after it lands.
 *   - When the parsed query is pure free text, fall through to the
 *     existing streaming `/api/search` — preserves the live "results
 *     appear as the backend finds them" UX users are already used to.
 *
 * Routing is decided by `parseQuery`'s output: any tag or ext filter
 * → recursive endpoint; otherwise → streaming. The free-text portion
 * is forwarded either way (recursive supports `q=` for basename
 * substring matching).
 *
 * Tag NAMES in the input get mapped to IDs via the cached tags store.
 * Unknown names (typos, stale references) are silently dropped from
 * the request — same semantic as `buildSearchParams`.
 *
 * Errors / aborts are forwarded unchanged so callers' existing
 * try/catch + abort plumbing keeps working.
 */
import { search as streamingSearch, tags as tagsApi } from "@/api";
import type { SearchHit } from "@/api/tags";
import { parseQuery, buildSearchParams } from "@/utils/searchQuery";
import { useTagsStore } from "@/stores/tags";
import urlUtil from "@/utils/url";

/**
 * Run a search that may or may not use structured filters depending
 * on the user's input.
 *
 * @param base       Scope root for the search. Same value the caller
 *                   would pass to the existing streaming `search()`.
 * @param input      Raw user input from the palette / Search.vue.
 * @param signal     Abort signal — honored on the streaming path
 *                   (passed through). Recursive responses don't accept
 *                   abort yet; if aborted post-call, the callback
 *                   simply isn't invoked for any item.
 * @param onResult   Per-item callback. Receives a unified `SearchHit`
 *                   shape so callers don't need to branch on backend.
 */
export async function searchSmart(
  base: string,
  input: string,
  signal: AbortSignal,
  onResult: (hit: SearchHit) => void
): Promise<void> {
  const parsed = parseQuery(input);
  const hasFilters = parsed.tags.length > 0 || parsed.ext !== "";

  if (!hasFilters) {
    // Pure free text → existing streaming path. The streaming
    // reshaper sets `item.url` to the fully-built `/files/...`
    // navigation target; we just forward it. `item.path` from the
    // streaming endpoint is relative to the search base, so derive
    // the basename from it but leave the absolute-path field
    // synthesized from the URL.
    await streamingSearch(base, input, signal, (item) => {
      if (signal.aborted) return;
      const name = basenameFromPath(item.path);
      // Strip the "/files" prefix from item.url to get the
      // scope-absolute path. /files/Documents/foo → /Documents/foo.
      const absPath = item.url.replace(/^\/files/, "") || "/";
      onResult({
        dir: item.isDir,
        path: decodePathSafe(absPath),
        name,
        url: item.url,
      });
    });
    return;
  }

  // Structured filters → recursive endpoint. Ensure the tags store
  // has loaded the user's tag list so name→ID mapping works.
  const tagsStore = useTagsStore();
  await tagsStore.ensureLoaded();
  const params = buildSearchParams(parsed, tagsStore.nameToId);

  const results = await tagsApi.searchRecursive(base, params);
  if (signal.aborted) return;
  for (const r of results) {
    if (signal.aborted) return;
    // Build the navigation URL from the scope-absolute path the
    // recursive endpoint returns. encodePath ensures spaces / unicode
    // round-trip correctly. Directories get a trailing slash to match
    // the convention everything else in the app uses.
    const url = `/files${urlUtil.encodePath(r.path)}${r.isDir ? "/" : ""}`;
    onResult({
      dir: r.isDir,
      path: r.path,
      name: r.name,
      url,
      size: r.size,
      modified: r.modified,
    });
  }
}

/** Pull the basename out of a path (decoded). Handles trailing
 *  slashes + empty segments. */
function basenameFromPath(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const segments = trimmed.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? p;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** decodeURIComponent that doesn't throw on partial / malformed
 *  inputs — just returns the raw string. Filenames from the server
 *  are well-formed, but defensive. */
function decodePathSafe(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}
