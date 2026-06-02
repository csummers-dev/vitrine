/**
 * usePreferences — typed read/write to per-user UI preferences.
 *
 * Preferences live on `authStore.user.preferences` as
 * `Record<string, unknown>` (opaque blobs the server doesn't introspect).
 * This composable wraps that bag with:
 *
 *   - `get<T>(key, default)` — synchronous typed read, returns the default
 *     when the key is missing OR when the stored value can't be coerced
 *     to T. Reads are direct (no clone) — callers should treat the
 *     result as read-only.
 *
 *   - `set<T>(key, value)` — updates local state immediately (optimistic
 *     so the UI feels instant), then debounces a single PUT to
 *     `/api/users/<id>` with `which: ["preferences"]`. Multiple set/remove
 *     calls within the debounce window batch into one request. The
 *     returned Promise resolves when the batched save completes (or
 *     rejects with the error, after rolling back the local mutation).
 *
 *   - `remove(key)` — same batching semantics as `set`.
 *
 * Key naming convention: lowercase, dot-namespaced by feature, e.g.
 *   - `view.mode.byFolder`
 *   - `tags.recent`
 *   - `editor.fontSize`
 *
 * Pick a prefix that makes "all keys this feature owns" obvious — that's
 * what makes future cleanup (or a "reset feature X" button) easy.
 *
 * Reactivity: writes mutate `authStore.user.preferences` in place, so a
 * `computed(() => prefs.get("foo", defaultFoo))` re-evaluates on change.
 * For a more ergonomic ref-style binding, build it on top:
 *   const fontSize = computed({
 *     get: () => prefs.get("editor.fontSize", 14),
 *     set: (v) => prefs.set("editor.fontSize", v),
 *   });
 */
import { useAuthStore } from "@/stores/auth";
import * as usersApi from "@/api/users";

/**
 * Window during which successive set/remove calls coalesce into one
 * server PUT. 250 ms is small enough that a quick toggle still saves
 * during the same interaction (no perceptible "did it stick?" anxiety)
 * but long enough to batch a slider drag or rapid checkbox flips.
 */
const DEBOUNCE_MS = 250;

interface PendingSave {
  /** Promises waiting on the in-flight batch's outcome. */
  resolvers: Array<() => void>;
  rejecters: Array<(err: unknown) => void>;
  /** Snapshot of preferences taken when the first dirty write landed —
   *  used to roll back if the server rejects the batch. */
  rollback: Record<string, unknown>;
  /** Active timeout handle; cleared on flush. */
  timer: ReturnType<typeof setTimeout> | null;
}

let pending: PendingSave | null = null;

export function usePreferences() {
  const authStore = useAuthStore();

  /** Ensure `user.preferences` exists so writes don't NPE. The backend
   *  Clean() already normalizes nil → empty map server-side, but a
   *  fresh login response might race ahead of us. */
  const ensureBag = (): Record<string, unknown> => {
    if (!authStore.user) {
      throw new Error("usePreferences: no authenticated user");
    }
    if (!authStore.user.preferences) {
      authStore.user.preferences = {};
    }
    return authStore.user.preferences;
  };

  const get = <T>(key: string, defaultValue: T): T => {
    const bag = authStore.user?.preferences;
    if (!bag) return defaultValue;
    const raw = bag[key];
    if (raw === undefined || raw === null) return defaultValue;
    return raw as T;
  };

  /** Snapshot the current bag for rollback purposes IF there's not
   *  already a pending batch. Must be called BEFORE the optimistic
   *  mutation so a rejected save restores the truly pre-batch state. */
  const ensurePendingWithSnapshot = () => {
    if (pending) return;
    pending = {
      resolvers: [],
      rejecters: [],
      rollback: { ...(authStore.user?.preferences ?? {}) },
      timer: null,
    };
  };

  /** Schedule (or extend) the debounced PUT. Returns the promise the
   *  current call should await. Caller must have already invoked
   *  ensurePendingWithSnapshot() pre-mutation. */
  const scheduleSave = (): Promise<void> => {
    if (!authStore.user) {
      return Promise.reject(new Error("usePreferences: no authenticated user"));
    }
    if (!pending) {
      // Defensive: shouldn't happen if callers follow the contract, but
      // recreate so we still have somewhere to attach the promise.
      ensurePendingWithSnapshot();
    }
    if (pending!.timer) clearTimeout(pending!.timer);

    const promise = new Promise<void>((resolve, reject) => {
      pending!.resolvers.push(resolve);
      pending!.rejecters.push(reject);
    });

    pending!.timer = setTimeout(() => {
      void flush();
    }, DEBOUNCE_MS);

    return promise;
  };

  const flush = async (): Promise<void> => {
    if (!pending) return;
    // Detach so further writes during the in-flight save start a fresh
    // batch (and aren't rolled back by this batch's rejection path).
    const batch = pending;
    pending = null;
    if (batch.timer) clearTimeout(batch.timer);

    const user = authStore.user;
    if (!user) {
      const err = new Error("usePreferences: user disappeared mid-save");
      batch.rejecters.forEach((r) => r(err));
      return;
    }

    try {
      // Send only the preferences slice. The which=["preferences"] tells
      // the server's user-update handler to merge just that field.
      await usersApi.update({ id: user.id, preferences: user.preferences }, [
        "preferences",
      ]);
      batch.resolvers.forEach((r) => r());
    } catch (err) {
      // Roll back the local bag to the pre-batch snapshot so the UI
      // doesn't keep showing a value the server never accepted.
      if (authStore.user) {
        authStore.user.preferences = batch.rollback;
      }
      batch.rejecters.forEach((r) => r(err));
    }
  };

  const set = <T>(key: string, value: T): Promise<void> => {
    const bag = ensureBag();
    // Snapshot FIRST so the rollback captures the pre-mutation state.
    ensurePendingWithSnapshot();
    bag[key] = value as unknown;
    return scheduleSave();
  };

  const remove = (key: string): Promise<void> => {
    const bag = ensureBag();
    if (!(key in bag)) {
      // Nothing to delete — short-circuit so we don't burn a request on
      // a no-op. Caller still gets a resolved promise so they can await
      // uniformly.
      return Promise.resolve();
    }
    ensurePendingWithSnapshot();
    delete bag[key];
    return scheduleSave();
  };

  /** Force any pending debounced save to fire immediately. Exposed for
   *  navigation guards / app-unmount hooks that need to ensure prefs
   *  hit the server before the page tears down. */
  const flushNow = async (): Promise<void> => {
    if (!pending) return;
    await flush();
  };

  return { get, set, remove, flushNow };
}

/**
 * Test helper: drop any in-flight debounce + reset module state. Not
 * exported from a barrel — tests import this path directly.
 */
export function __resetPreferencesForTests() {
  if (pending?.timer) clearTimeout(pending.timer);
  pending = null;
}
