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

const STORAGE_PREFIX = "fb:theme:";
const storageKey = (username: string | undefined) =>
  STORAGE_PREFIX + (username ?? "_anon");

/** Reads the stored preference for the current user, or "system" by default. */
const readPreference = (username: string | undefined): ThemePreference => {
  try {
    const raw = localStorage.getItem(storageKey(username));
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* localStorage may be disabled (private mode); fall through */
  }
  return "system";
};

/** Resolves a preference to the concrete "light" | "dark" that gets applied. */
const resolvePreference = (pref: ThemePreference): "light" | "dark" => {
  if (pref === "light" || pref === "dark") return pref;
  return getMediaPreference() === "dark" ? "dark" : "light";
};

// Singleton state — all callers share the same ref so changes propagate
// without needing a Pinia store.
const preference: Ref<ThemePreference> = ref<ThemePreference>("system");
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
