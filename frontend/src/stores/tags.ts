import { defineStore } from "pinia";
import { tags as tagsApi } from "@/api";

/**
 * Per-user tag cache.
 *
 * Two caches:
 *   - `tags` — the full user tag list. Loaded lazily on first access
 *     and re-fetched after any tag mutation. Backs the picker
 *     autocomplete, the color picker, and the `tagsApi.searchRecursive`
 *     name→ID lookup.
 *   - `byPath` — batched listing-row lookup. Keyed by file path. Loaded
 *     by FileListing after each directory fetch via a single
 *     `tagsApi.batchForFiles` call. Cleared on directory navigation.
 *
 * The store also exposes a `nameToId` getter for `buildSearchParams`
 * — it walks the cached tag list and returns a lowercase-keyed map.
 */
export const useTagsStore = defineStore("tags", {
  state: (): {
    tags: Tag[];
    byPath: Record<string, Tag[]>;
    loaded: boolean;
    loadingPromise: Promise<void> | null;
  } => ({
    tags: [],
    byPath: {},
    loaded: false,
    loadingPromise: null,
  }),
  getters: {
    /** Lowercase name → ID map for parser-to-search-params translation.
     *  Computed (not memoized) — the tag list is small enough that
     *  rebuilding on each access is cheaper than cache invalidation. */
    nameToId: (state): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const t of state.tags) out[t.name.toLowerCase()] = t.id;
      return out;
    },
    /** Quick existence check; used by the picker's "Create" affordance
     *  to suppress itself when the typed name already exists. */
    hasName:
      (state) =>
      (name: string): boolean => {
        const lower = name.toLowerCase();
        return state.tags.some((t) => t.name.toLowerCase() === lower);
      },
  },
  actions: {
    /** Load (or refresh) the full user tag list. Deduplicates concurrent
     *  callers via `loadingPromise` so a listing render that triggers
     *  N components to call ensure() ends up making exactly 1 HTTP
     *  request. */
    async ensureLoaded(): Promise<void> {
      if (this.loaded) return;
      if (this.loadingPromise) return this.loadingPromise;
      this.loadingPromise = tagsApi
        .list()
        .then((tags) => {
          this.tags = tags;
          this.loaded = true;
        })
        .finally(() => {
          this.loadingPromise = null;
        });
      return this.loadingPromise;
    },
    /** Force a re-fetch. Called after any tag mutation so the cached
     *  list (and the dependent picker + chip color renders) reflect
     *  the new state. */
    async refresh(): Promise<void> {
      this.loaded = false;
      return this.ensureLoaded();
    },
    /** Populate `byPath` for the current listing. Called by FileListing
     *  after each directory fetch. Replaces (not merges) the cache so
     *  stale entries from a previous folder don't leak through. */
    async loadForPaths(paths: string[]): Promise<void> {
      if (paths.length === 0) {
        this.byPath = {};
        return;
      }
      try {
        this.byPath = await tagsApi.batchForFiles(paths);
      } catch {
        // Tags being unavailable shouldn't break the listing render;
        // silently fall back to "no tags shown". The picker still
        // works via its own per-file load.
        this.byPath = {};
      }
    },
    /** Read cached tags for a path. Returns an empty array — not
     *  undefined — so consumers can iterate without a null check. */
    forPath(path: string): Tag[] {
      return this.byPath[path] ?? [];
    },
    /** Optimistic local update after the picker commits a diff. Patches
     *  byPath in place so the listing row reflects the new set on the
     *  next render, without waiting for a full re-fetch. */
    setLocalForPath(path: string, tags: Tag[]) {
      if (tags.length === 0) {
        delete this.byPath[path];
      } else {
        this.byPath[path] = tags;
      }
    },
    /** Wipe everything (logout / store reset). */
    clear() {
      this.$reset();
    },
  },
});
