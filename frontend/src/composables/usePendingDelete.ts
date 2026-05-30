import { ref, type Ref } from "vue";

/**
 * Singleton state for the optimistic delete + undo flow (Stage 8).
 *
 * Flow:
 *   1. User triggers delete → `queue(items)` is called.
 *   2. Items' URLs are added to `pendingPaths`, immediately hiding them from
 *      the listing (FileListing's `items` computed filters them out).
 *   3. A timer (default 5s) is started.
 *   4. If `undo()` fires first → timer is cancelled, paths are cleared, items
 *      reappear, no API call is made.
 *   5. If the timer fires → `commit()` runs each `api.remove` call. On
 *      completion (or error), paths are cleared and the listing is reloaded.
 *
 * Why a singleton: only one undo window is meaningful at a time. A second
 * delete while one is pending should commit the first (no stacked undos),
 * then start its own window. We model that by committing on `queue()` if
 * a window is already open.
 */

export interface PendingDeleteItem {
  /** Backend URL used as the api.remove() arg, and the dedup key. */
  url: string;
  /** Display name for the toast. */
  name: string;
}

const pendingPaths: Ref<Set<string>> = ref(new Set());
const inFlight: Ref<PendingDeleteItem[]> = ref([]);
let commitTimer: ReturnType<typeof setTimeout> | null = null;
let resolverFn: ((didUndo: boolean) => void) | null = null;

export function usePendingDelete() {
  const isPending = (url: string) => pendingPaths.value.has(url);

  const clear = () => {
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    pendingPaths.value = new Set();
    inFlight.value = [];
    resolverFn = null;
  };

  /**
   * Queue items for optimistic deletion. Returns a promise that resolves to
   * `true` if the user undid before the timer expired, `false` otherwise.
   * The caller is responsible for actually invoking `api.remove()` on commit
   * — this composable just owns the UI state and timing.
   */
  const queue = (
    items: PendingDeleteItem[],
    delayMs = 5000
  ): Promise<boolean> => {
    // If a previous window is still open, resolve it as "committed" so the
    // caller can run the real deletes for those before starting a new window.
    if (resolverFn) {
      const prev = resolverFn;
      resolverFn = null;
      if (commitTimer) {
        clearTimeout(commitTimer);
        commitTimer = null;
      }
      prev(false);
    }

    inFlight.value = items;
    const next = new Set(pendingPaths.value);
    for (const i of items) next.add(i.url);
    pendingPaths.value = next;

    return new Promise<boolean>((resolve) => {
      resolverFn = resolve;
      commitTimer = setTimeout(() => {
        commitTimer = null;
        const r = resolverFn;
        resolverFn = null;
        if (r) r(false);
      }, delayMs);
    });
  };

  const undo = () => {
    if (!resolverFn) return;
    const r = resolverFn;
    resolverFn = null;
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    pendingPaths.value = new Set();
    inFlight.value = [];
    r(true);
  };

  return {
    pendingPaths,
    inFlight,
    isPending,
    queue,
    undo,
    clear,
  };
}
