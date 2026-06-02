/**
 * Tags API client (v1.3 Stage 2).
 *
 * Wraps the backend's per-user tag CRUD + file↔tag mapping endpoints.
 * All calls are scoped to the authenticated user — there's no notion
 * of cross-user tag visibility in v1.3, so no userID parameter.
 *
 * The `tagPathUrl` helper encodes the file path correctly so spaces,
 * unicode, and `?#` in filenames don't break the URL. The backend reads
 * the path from r.URL.Path after stripping `/api/files-tags`.
 */
import { fetchJSON, fetchURL, removePrefix, StatusError } from "./utils";

/** Build the per-file mapping URL, percent-encoding each path segment
 *  but preserving the slash structure. removePrefix is a no-op here —
 *  callers pass paths like "/Documents/draft.txt" directly. */
function tagPathUrl(path: string): string {
  // Trim leading slash so we can join cleanly, then encode each segment.
  const trimmed = path.replace(/^\/+/, "");
  const encoded = trimmed
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/api/files-tags/${encoded}`;
}

// ── Tag CRUD ─────────────────────────────────────────────────────────

export async function list(): Promise<Tag[]> {
  return fetchJSON<Tag[]>(`/api/tags`, {});
}

export async function create(name: string, color?: TagColor): Promise<Tag> {
  const res = await fetchURL(`/api/tags`, {
    method: "POST",
    body: JSON.stringify({ name, color: color ?? "" }),
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new StatusError(await res.text(), res.status);
  }
  return (await res.json()) as Tag;
}

export async function update(
  id: number,
  patch: { name?: string; color?: TagColor }
): Promise<Tag> {
  const res = await fetchURL(`/api/tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: patch.name ?? "", color: patch.color ?? "" }),
  });
  if (res.status !== 200) {
    throw new StatusError(await res.text(), res.status);
  }
  return (await res.json()) as Tag;
}

export async function del(id: number): Promise<void> {
  const res = await fetchURL(`/api/tags/${id}`, { method: "DELETE" });
  if (res.status !== 204) {
    throw new StatusError(await res.text(), res.status);
  }
}

// ── File ↔ tag mapping ──────────────────────────────────────────────

export async function forFile(path: string): Promise<Tag[]> {
  return fetchJSON<Tag[]>(tagPathUrl(path), {});
}

export async function attach(path: string, tagId: number): Promise<void> {
  const res = await fetchURL(`${tagPathUrl(path)}?id=${tagId}`, {
    method: "POST",
  });
  if (res.status !== 204) {
    throw new StatusError(await res.text(), res.status);
  }
}

export async function detach(path: string, tagId: number): Promise<void> {
  const res = await fetchURL(`${tagPathUrl(path)}?id=${tagId}`, {
    method: "DELETE",
  });
  if (res.status !== 204) {
    throw new StatusError(await res.text(), res.status);
  }
}

/** Batch tags-for-paths lookup. Returns {path: Tag[]} — paths with no
 *  tags are omitted from the response. Use this for listing-row tag
 *  rendering to avoid N+1. */
export async function batchForFiles(
  paths: string[]
): Promise<Record<string, Tag[]>> {
  if (paths.length === 0) return {};
  const res = await fetchURL(`/api/tags/batch`, {
    method: "POST",
    body: JSON.stringify({ paths }),
  });
  if (res.status !== 200) {
    throw new StatusError(await res.text(), res.status);
  }
  return (await res.json()) as Record<string, Tag[]>;
}

// ── Compound search (S2-4 endpoint) ─────────────────────────────────

/** Smart-folder + palette-driven search. Path scopes the recursive
 *  walk; params come from parseQuery + buildSearchParams. */
export async function searchRecursive(
  path: string,
  searchParams: string
): Promise<RecursiveEntry[]> {
  const apiPath = removePrefix(path) || "/";
  const url = `/api/search/recursive${apiPath}${searchParams ? `?${searchParams}` : ""}`;
  return fetchJSON<RecursiveEntry[]>(url, {});
}

/**
 * Item shape callers expect from search dispatchers. `url` is the
 * full `/files/…` navigation target ready to hand to `router.push`,
 * which papers over the path-shape difference between the streaming
 * search (returns relative paths the reshaper combines with base)
 * and the recursive endpoint (returns scope-absolute paths).
 *
 * `path` is the scope-absolute filesystem path; `name` is the
 * basename. Both populated on every hit so callers don't need to
 * parse the URL.
 */
export interface SearchHit {
  dir: boolean;
  path: string;
  name: string;
  url: string;
  size?: number;
  modified?: string;
}
