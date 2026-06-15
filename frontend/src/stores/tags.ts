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
     *  after each directory fetch. Refreshes exactly the queried paths
     *  (sets those with tags, clears those without) while leaving every
     *  OTHER path untouched — so the two panes don't wipe each other's
     *  chips (dual-pane: each navigation only touched its own folder, but
     *  a whole-map replace dropped the other pane's tags + re-fetched on
     *  every move). Stale entries for folders no longer shown are harmless:
     *  a row only ever reads `forPath(itsOwnUrl)`. */
    async loadForPaths(paths: string[]): Promise<void> {
      if (paths.length === 0) return;
      try {
        const fresh = await tagsApi.batchForFiles(paths);
        for (const p of paths) {
          if (fresh[p]?.length) this.byPath[p] = fresh[p];
          else delete this.byPath[p];
        }
      } catch {
        // Tags being unavailable shouldn't break the listing render;
        // silently leave the cache as-is (rows fall back to "no tags").
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
