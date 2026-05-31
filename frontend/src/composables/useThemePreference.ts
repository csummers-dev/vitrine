import { ref, watch, onMounted, onUnmounted, type Ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { setTheme, getMediaPreference } from "@/utils/theme";

/**
 * User-facing theme preference. Three values:
 *   - "light" / "dark" → explicit choice
 *   - "system"         → follow `prefers-color-scheme`
 *
 * Stored in localStorage keyed by username (per-browser, per-user), so two
 * accounts on the same machine can have different themes. Falls back to the
 * global install default if no per-user preference is set, then to system.
 *
 * The composable doesn't talk to the backend — theme is a presentation
 * setting that doesn't need to roam across devices (the global install
 * default already provides a server-side starting point).
 */
export type ThemePreference = "light" | "dark" | "system";

/** The first-init default for every new user / browser. Persisted to
 *  localStorage on first read so the choice is explicit, visible in
 *  DevTools, and propagates across reloads — instead of just being a
 *  silent in-memory fallback. */
const DEFAULT_PREFERENCE: ThemePreference = "system";

const STORAGE_PREFIX = "fb:theme:";
const storageKey = (username: string | undefined) =>
  STORAGE_PREFIX + (username ?? "_anon");

/**
 * Reads the stored preference for the current user, returning
 * `DEFAULT_PREFERENCE` ("system") when nothing is stored. If the
 * fallback fires, we also WRITE the default back so subsequent reads
 * (or other tabs / windows of the same browser) see a concrete value
 * rather than discovering an empty slot of their own.
 */
const readPreference = (username: string | undefined): ThemePreference => {
  try {
    const raw = localStorage.getItem(storageKey(username));
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    // First-init for this user/browser — persist the default so it
    // becomes explicit. (Wrapped in another try since the read could
    // succeed but the write could fail in some edge cases, e.g. quota.)
    try {
      localStorage.setItem(storageKey(username), DEFAULT_PREFERENCE);
    } catch {
      /* swallow */
    }
  } catch {
    /* localStorage may be disabled (private mode); fall through */
  }
  return DEFAULT_PREFERENCE;
};

/** Resolves a preference to the concrete "light" | "dark" that gets applied. */
const resolvePreference = (pref: ThemePreference): "light" | "dark" => {
  if (pref === "light" || pref === "dark") return pref;
  return getMediaPreference() === "dark" ? "dark" : "light";
};

// Singleton state — all callers share the same ref so changes propagate
// without needing a Pinia store. Seeded with DEFAULT_PREFERENCE so the
// SegmentedControl in Settings highlights "System" on first render,
// even before init() has had a chance to run.
const preference: Ref<ThemePreference> =
  ref<ThemePreference>(DEFAULT_PREFERENCE);
let inited = false;

export function useThemePreference() {
  const authStore = useAuthStore();

  /** Apply a preference: persist it, resolve it, push to <html class>. */
  const set = (next: ThemePreference) => {
    preference.value = next;
    try {
      localStorage.setItem(storageKey(authStore.user?.username), next);
    } catch {
      /* swallow */
    }
    setTheme(resolvePreference(next));
  };

  /** First-run init: load saved preference + start watching the OS setting. */
  const init = () => {
    if (inited) return;
    inited = true;
    preference.value = readPreference(authStore.user?.username);
    setTheme(resolvePreference(preference.value));

    // When the user picks "system", track OS changes live.
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (preference.value === "system") {
        setTheme(resolvePreference("system"));
      }
    };
    // Modern API (Chrome/Safari/FF current): addEventListener('change', …)
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onMediaChange);
    } else if (typeof (mql as any).addListener === "function") {
      // Safari < 14 fallback
      (mql as any).addListener(onMediaChange);
    }
  };

  // When the user logs in or switches accounts, re-read their preference.
  watch(
    () => authStore.user?.username,
    (username) => {
      if (!inited) return;
      preference.value = readPreference(username);
      setTheme(resolvePreference(preference.value));
    }
  );

  return {
    preference,
    set,
    init,
  };
}

/** Mount-time helper: just calls init() and cleans up on unmount.
 *  Use this inside App.vue so it runs exactly once per session. */
export function useThemeBootstrap() {
  const { init } = useThemePreference();
  onMounted(init);
  // No cleanup needed — the matchMedia listener lives for the page lifetime.
  onUnmounted(() => {
    /* no-op for symmetry */
  });
}
